import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fileUpload from 'express-fileupload';
import { S3Client, PutObjectCommand, DeleteObjectCommand} from "@aws-sdk/client-s3"
import dotenv from 'dotenv';
import pg from "pg";
import {Server} from "socket.io";



dotenv.config();

const bucketName = process.env.BUCKET_NAME
const region = process.env.BUCKET_REGION
const accessKeyId = process.env.ACCESS_KEY
const secretAccessKey = process.env.SECRET_ACCESS_KEY
const db_username = process.env.DB_USERNAME
const db_password = process.env.DB_PASSWORD
const database = process.env.DB
const db_port = process.env.DB_PORT
const db_host = process.env.DB_HOST
const port = process.env.PORT


const db = new pg.Client({
    user: db_username,
    host: db_host,
    database: database,
    password: db_password,
    port: db_port,
    ssl: {
        rejectUnauthorized: false // This disables strict SSL certificate validation
    }
});
db.connect();

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
})


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const server = http.createServer(app);

const io = new Server(server);
// ingredients: a dict {ingredient_name: genre (meat or veg)}
// 肉: 1, 蔬菜: 2，丸子: 3，海鲜: 4，菌类: 5，豆制品: 6, 主食: 7, 小料米饭: 8
// 香菇 for meat side, 乌冬面 for veg side (exceptions)
const ingredients_dict = {}; // a dict {ingredient_name: genre (1, .....8)} 8 genres
const prep_side_dict = {}; // a dict {ingredient_name: prep_side (meat or veg)}
const url_dict = {}; // {name: timestamp} stores timestamp solely for image files (name-timestamp.jpg)
var remain_lst = []; // a list of ingredients that not in shortage (on the left side of the page)

// the following dicts keep track of the urgency level and portion size of the shortage ingredients
var shortage_dict = {}; // {name: [urgency, portion]} urgency: true/false; portion: small/large
// var meat_side_dict = {}; // {name: urgency}
// var veg_side_dict = {}; // {name: urgency}


// populate the local data structures with the data from the database
async function populate_ingredients() {
    try {
        const res = await db.query("SELECT * FROM ingredients");
        res.rows.forEach(row => {
            ingredients_dict[row.name] = row.category;
            prep_side_dict[row.name] = row.prep_side;
            url_dict[row.name] = row.timestamp; // could null if images not updated
            remain_lst.push(row.name);
        });
    } catch (err) {
        console.error("Error initializing dictionaries:", err);
    }
}
populate_ingredients();

// Middlewares 
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(express.json());
app.use(fileUpload());


// cache the css file for 1 day (86400 seconds) and audio files for 7 days (604800 seconds) for faster loading time
app.use(
    express.static(path.join(__dirname, 'public'), {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        } else if (filePath.endsWith('.mp3')) {
          res.setHeader('Cache-Control', 'public, max-age=604800');
        }
      },
    })
  );

// Listens to new clients connecting to the server
io.on("connection", (socket) => {
    //console.log("A client connected:", socket.id);
    // Optional: Handle client disconnection
    socket.on("disconnect", () => {
        //console.log("A client disconnected:", socket.id);
    });
});


// renders the index page used by the buffet staff
app.get("/", (req, res) => {
    res.render("index.ejs", {remain: remain_lst, shortage: shortage_dict, req: req, timestamps: url_dict});
});

// renders the meat side page viewed by the meat chef
app.get('/meat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/pages/meat.html'));
});
  
/* // renders the veg side page viewed by the veg chef
app.get("/veg", (req, res) => {
    res.sendFile(path.join(__dirname, 'public/pages/veg.html'));
}); */

// move a meat ingredient from remain to shortage and notify the meat chef in the kitchen to start prepping
app.post("/addMeat", (req, res) => {
    const renderList = Object.entries(shortage_dict).map(([name, [urgent, portion]]) => ({
        name,
        urgent,
        portion,
        timestamp: url_dict[name]
      })); // a list of objects {name: name, urgent: urgent, timestamp: ts}
    io.emit("updates shortage", {renderList: renderList, message : "prepping a meat"}); // send the list of shortage ingredients to render
    res.status(200).json({ status: "ok" });
});

// once the meat chef finishes preping and buffet staff confirms it, remove the ingredient from shortage and move it back to remain
app.post("/removeMeat", (req, res) => {
    const renderList = Object.entries(shortage_dict).map(([name, [urgent, portion]]) => ({
        name,
        urgent,
        portion,
        timestamp: url_dict[name]
      })); // a list of objects {name: name, urgent: urgent, timestamp: ts}
    io.emit("updates shortage", {renderList: renderList, message : "received the ingredient"}); // the message now should be "received the ingredient"
    res.status(200).json({ status: "ok" });
});

/* move a veg ingredient from remain to shortage and notify the veg chef in the kitchen to start prepping
archive function: all prepping is done on meat side now
app.post("/addVeg", (req, res) => {
    const renderList = Object.entries(shortage_dict).map(([name, urgent]) => ({
        name,
        urgent,
        timestamp: url_dict[name]
      })); // a list of objects {name: name, urgent: urgent, timestamp: ts}
    io.emit("updates shortage", {renderList: renderList, message : "prepping a veg"}); // send the list of shortage ingredients to render
    res.status(200).json({ status: "ok" });
}) */

/* once the veg chef finishes preping and buffet staff confirms it, remove the ingredient from shortage and move it back to remain
archive function: all prepping done on the meat side now
app.post("/removeVeg", (req, res) => {
    const renderList = Object.entries(shortage_dict).map(([name, urgent]) => ({
        name,
        urgent,
        timestamp: url_dict[name]
      })); // a list of objects {name: name, urgent: urgent, timestamp: ts}
    io.emit("updates shortage", {renderList: renderList, message : "received the ingredient"}); // the message now should be "received the ingredient"
    res.status(200).json({ status: "ok" });
}) */

// add an ingredient to the shortage list (removing it from remain_lst) and notify the chef in the kitchen
app.post("/remain/:name", async (req, res) => {
    const urgency = req.body.urgency;       // "regular" or "urgent"
    const portion_size = req.body.portion;  // "small" or "large"

    const urgent = urgency === "urgent" ? true : false;
    const portion = portion_size === "large" ? "大份 große Portion" : "小份 kleine Portion";

    const name = req.params.name;
    const prep_side = prep_side_dict[name]; // locate the genre so that we know to which kitchen we are sending
    // remove the ingredient from remain_lst
    if (name !== "米饭 Reis"){ // if it is not rice, remove it from remain_lst
        remain_lst = remain_lst.filter((remain) => {
            return remain !== name;
        });
        shortage_dict[name] = [urgent, portion]; // [true/false, small/large]
    }else if (name in shortage_dict){ // if it is rice, remain it in remain_lst and shortage_dict["rice"] = # of rices needed
        shortage_dict[name] += 1;
    }else{
        shortage_dict[name] = 1;
    }
    
    // update the meat end if it is a meat; otherwise update the veg end
    if (prep_side === "meat"){
        try {
            const response = await axios.post(`http://localhost:${port}/addMeat`);
        }catch (error){
            console.log(error);
        }
        
    }else{
        try{
            const response = await axios.post(`http://localhost:${port}/addVeg`);
        }catch (error){
            console.log(error);
        }
    }
    const currentRoute = req.query.currentRoute || "/"; // this ensures the page stays when user is moving ingredients around during sortBy
    res.redirect(currentRoute);
});

// remove an ingredient from the shortage list (adding it back to remain_lst) and notify the chef in the kitchen
app.post("/shortage/:name", async (req, res)=>{
    const name = req.params.name;
    const prep_side = prep_side_dict[name]; // locate the genre so that we know to which kitchen we are sending
    if (name !== "米饭 Reis"){ // if it is not rice, remove it from shortage_lst
        delete shortage_dict[name];
        remain_lst = [...remain_lst, name]; // add the ingredient back to the remain_lst
    }else if (shortage_dict[name] > 1){
        shortage_dict[name] -= 1;
    }else{
        delete shortage_dict[name];
    }
    // update the meat end if it is a meat; otherwise update the veg end
    if (prep_side === "meat"){
        try {
            const response = await axios.post(`http://localhost:${port}/removeMeat`);
        }catch (error){
            console.log(error);
        }
        
    }else{
        try{
            const response = await axios.post(`http://localhost:${port}/removeVeg`);
        }catch (error){
            console.log(error);
        }
    }
    res.redirect("/"); // re-renders the front side page
})

// insert the new ingredient into the database and upload the image to S3 bucket
app.post("/upload", async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send("No files were uploaded.");
    }
  
    const file = req.files.file;
    const ingredientName = req.body.name.trim();
    const category = req.body.category;
    const prep_side = req.body.prep_side;
    let category_int = 0;
    const ingredientName_in_mandarin = ingredientName.split(" ")[0];
  
    // Define S3 upload parameters
    const timestamp = Date.now();
    const uploadParams = {
        Bucket: bucketName,
        Body: file.data,
        Key: `${ingredientName_in_mandarin}-${timestamp}.jpg`, // Unique key for every upload
        ContentType: "image/jpeg",
    };
    switch (category) {
        case 'meat':
            ingredients_dict[ingredientName] = 1;
            category_int = 1;
            break;
        case 'veg':
            ingredients_dict[ingredientName] = 2;
            category_int = 2;
            break;
        case 'ball':
            ingredients_dict[ingredientName] = 3;
            category_int = 3;
            break;
        case 'seafood':
            ingredients_dict[ingredientName] = 4;
            category_int = 4;
            break;
        case 'fungi':
            ingredients_dict[ingredientName] = 5;
            category_int = 5;
            break;
        case 'bean':
            ingredients_dict[ingredientName] = 6;
            category_int = 6;
            break;
        case 'noodle':
            ingredients_dict[ingredientName] = 7;
            category_int = 7;
            break;
        case 'sauce':
            ingredients_dict[ingredientName] = 8;
            category_int = 8;
            break;
        default:
            console.log('Unknown category');
    }
    remain_lst.push(ingredientName);
    prep_side_dict[ingredientName] = prep_side;
    url_dict[ingredientName] = timestamp; 
    try {
        await db.query("INSERT INTO ingredients (name, category, prep_side, timestamp) VALUES ($1, $2, $3, $4)", [ingredientName, category_int, prep_side, timestamp]);
        // Send the upload to S3
        await s3Client.send(new PutObjectCommand(uploadParams));
        res.redirect("/");
    } catch (err) {
        console.error("Error uploading file:", err);
        res.status(500).send("Error uploading file.");
    }
  });

// delete the ingredient from the database and remove the image from S3 bucket
app.post("/delete/:name", async (req, res) => {
    const name = req.params.name;
    const timestamp = url_dict[name];
    var imageName = "";
    imageName = timestamp === null ? `${name.split(' ')[0]}.jpg` : `${name.split(' ')[0]}-${timestamp}.jpg`;
    try {
        // Delete the item from the database
        await db.query("DELETE FROM ingredients WHERE name = $1", [name]);

        // Remove the item from the in-memory data structures
        delete ingredients_dict[name];
        delete prep_side_dict[name];
        delete url_dict[name];
        remain_lst = remain_lst.filter(item => item !== name);
        // Delete the image from the S3 bucket
        const deleteParams = {
            Bucket: bucketName,
            Key: imageName,
        };
        await s3Client.send(new DeleteObjectCommand(deleteParams));

        // Redirect back to the current route
        const currentRoute = req.query.currentRoute || "/";
        res.redirect(currentRoute);
    } catch (err) {
        console.error("Error deleting item:", err);
        res.status(500).send("Error deleting item.");
    }
});

// edit the ingredient in the database and update the image in S3 bucket
app.post("/edit/:name", async (req, res) => {
    const ingredientName = req.params.name;
    const category = req.body.category;
    const prep_side = req.body.prep_side;
    const file = req.files?.file; // File may not be provided for an edit

    let category_int = 0;
    switch (category) {
        case 'meat': category_int = 1; break;
        case 'veg': category_int = 2; break;
        case 'ball': category_int = 3; break;
        case 'seafood': category_int = 4; break;
        case 'fungi': category_int = 5; break;
        case 'bean': category_int = 6; break;
        case 'noodle': category_int = 7; break;
        case 'sauce': category_int = 8; break;
        default: console.log('Unknown category');
    }
    // had to update the in-memory structure because it reflects changes immediately
    ingredients_dict[ingredientName] = category_int;
    prep_side_dict[ingredientName] = prep_side;

    try {
        if (file) { // if there is new file uploaded, update the timestamp
            const timestamp = Date.now();
            const old_timestamp = url_dict[ingredientName];
            var imageName = "";
            imageName = old_timestamp === null ? `${ingredientName.split(' ')[0]}.jpg` : `${ingredientName.split(' ')[0]}-${old_timestamp}.jpg`;
            url_dict[ingredientName] = timestamp; // !!!IMPORTANT: always update the in-memory storage
            await db.query(
                "UPDATE ingredients SET category = $1, prep_side = $2, timestamp = $3 WHERE name = $4",
                [category_int, prep_side, timestamp, ingredientName]
            );
            //upload the new image
            const uploadParams = {
                Bucket: bucketName,
                Body: file.data,
                Key: `${ingredientName.split(" ")[0]}-${timestamp}.jpg`,
                ContentType: "image/jpeg",
            };
            await s3Client.send(new PutObjectCommand(uploadParams));
            
            // delete the old image
            const deleteParams = {
                Bucket: bucketName,
                Key: imageName,
            };
            await s3Client.send(new DeleteObjectCommand(deleteParams));
        }else{ // if there is no new file uploaded, just update the category and prep_side in the database
            await db.query(
                "UPDATE ingredients SET category = $1, prep_side = $2 WHERE name = $3",
                [category_int, prep_side, ingredientName]
            );
        }
        res.redirect("/");
    } catch (err) {
        console.error("Error editing ingredient:", err);
        res.status(500).send("Error editing ingredient.");
    }
});



// sort the ingredients by their genre (meat, veg, ball, seafood, fungi, bean, noodle, sauce)
app.get("/sortByMeat", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 1){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req, timestamps: url_dict});
    
});

app.get("/sortByVeg", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 2){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req, timestamps: url_dict});
});
app.get("/sortByBall", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 3){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req, timestamps: url_dict});
});
app.get("/sortBySeafood", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 4){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req, timestamps: url_dict});
});
app.get("/sortByFungi", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 5){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req, timestamps: url_dict});
});
app.get("/sortByBean", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 6){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req, timestamps: url_dict});
});
app.get("/sortByNoodle", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 7){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req, timestamps: url_dict});
});

app.get("/sortBySauce", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 8){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req, timestamps: url_dict});
});

// sends a help signal to transfer one kitchen staff to help with the front kitchen
app.post('/help', (req, res) => {
    io.emit("help");
    res.status(200).json({ status: "ok" });
});

server.listen(port, () => {
    console.log(`app listening on ${port}`);
});
