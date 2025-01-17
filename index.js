import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import {WebSocketServer, WebSocket} from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import fileUpload from 'express-fileupload';
import { S3Client, PutObjectCommand, DeleteObjectCommand} from "@aws-sdk/client-s3"
import dotenv from 'dotenv';
import pg from "pg";




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

const wss = new WebSocketServer({server});
// ingredients: a dict {ingredient_name: genre (meat or veg)}
// dictionary remains constant; each time renders the lists
// 肉: 1, 蔬菜: 2，丸子: 3，海鲜: 4，菌类: 5，豆制品: 6, 主食: 7, 小料米饭: 8
// 香菇 for meat side, 乌冬面 for veg side (exceptions)
const ingredients_dict = {};
const prep_side_dict = {};
var remain_lst = [];


var shortage_dict = {}; // {name: urgency}
var meat_side_dict = {}; // {name: urgency}
var veg_side_dict = {}; // {name: urgency}

async function get_ingredients() {
    try {
        const res = await db.query("SELECT * FROM ingredients");
        res.rows.forEach(row => {
            ingredients_dict[row.name] = row.category;
            prep_side_dict[row.name] = row.prep_side;
            remain_lst.push(row.name);
        });
    } catch (err) {
        console.error("Error initializing dictionaries:", err);
    }
}
get_ingredients();



app.use(bodyParser.urlencoded({ extended: true })); 
app.use(express.json());
app.use(fileUpload());



// Serve CSS files with shorter caching
app.use(
  "/css",
  express.static(path.join(__dirname, "public/css"), {
    maxAge: "1d", // Cache for 1 day
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day in seconds
    },
  })
);
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));

// Notify clients when a page is rendered
function notifyClients(action, page) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ action, page }));
        }
    });
}


app.post("/upload", async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).send("No files were uploaded.");
    }
  
    const file = req.files.file;
    const ingredientName = req.body.name;
    const category = req.body.category;
    const prep_side = req.body.prep_side;
    let category_int = 0;
    //console.log(ingredientName, category)
  
    // Define S3 upload parameters
    const uploadParams = {
        Bucket: bucketName,
        Body: file.data,
        Key: `${ingredientName.split(" ")[0]}.jpg`, // Ensure the file is saved with a .jpg extension
        ContentType: "image/jpeg"
    }
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
    try {
        await db.query("INSERT INTO ingredients (name, category, prep_side) VALUES ($1, $2, $3)", [ingredientName, category_int, prep_side]);
        // Send the upload to S3
        await s3Client.send(new PutObjectCommand(uploadParams));
        res.redirect("/");
    } catch (err) {
        console.error("Error uploading file:", err);
        res.status(500).send("Error uploading file.");
    }
  });
// meat: remain -> shortage
app.post("/addMeat", (req, res) => {
    const name = req.body.name;
    const urgent = req.body.urgent;
    if (name !== "米饭 Reis"){
        meat_side_dict[name] = urgent;
    }else if (meat_side_dict[name] >= 1){
        meat_side_dict[name] += 1;
    }else{
        meat_side_dict[name] = 1;
    }
    notifyClients('add', 'meat');
    res.redirect("/meat");

})

app.post("/addVeg", (req, res) => {
    const name = req.body.name;
    const urgent = req.body.urgent;
    veg_side_dict[name] = urgent;
    notifyClients('add', 'veg'); // Notify clients after rendering index.ejs
    res.redirect("/veg");
})

// meat: shortage -> remain
app.post("/removeMeat", (req, res) => {
    const name = req.body.name;
    if (name !== "米饭 Reis"){
        delete meat_side_dict[name];
    }else if (meat_side_dict[name] > 1){
        meat_side_dict[name] -= 1;
    }else{
        delete meat_side_dict[name];
    }
    notifyClients('remove', 'meat');
    res.redirect("/meat");
})

// veg: shortage -> remain
app.post("/removeVeg", (req, res) => {
    const name = req.body.name;
    delete veg_side_dict[name];
    notifyClients('remove', 'veg'); // Notify clients after rendering index.ejs
    res.redirect("/veg");
})


app.get("/", (req, res) => {
    res.render("index.ejs", {remain: remain_lst, shortage: shortage_dict, req: req});
});

app.get("/meat", (req, res) => {
    res.render("meat.ejs", {meats: meat_side_dict});

});

app.get("/veg", (req, res) => {
    res.render("veg.ejs", {vegs: veg_side_dict});

});

app.get("/sortByMeat", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 1){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req});
    
});

app.get("/sortByVeg", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 2){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req});
});
app.get("/sortByBall", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 3){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req});
});
app.get("/sortBySeafood", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 4){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req});
});
app.get("/sortByFungi", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 5){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req});
});
app.get("/sortByBean", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 6){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req});
});
app.get("/sortByNoodle", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 7){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req});
});

app.get("/sortBySauce", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 8){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict, req: req});
});

app.post("/delete/:name", async (req, res) => {
    const name = req.params.name;
    const imageName = name.split(" ")[0] + ".jpg"; // Assuming the S3 key is the first part of the ingredient name + `.jpg`

    try {
        // Delete the item from the database
        await db.query("DELETE FROM ingredients WHERE name = $1", [name]);

        // Remove the item from the in-memory data structures
        delete ingredients_dict[name];
        delete prep_side_dict[name];
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
        // Update the database
        await db.query(
            "UPDATE ingredients SET category = $1, prep_side = $2 WHERE name = $3",
            [category_int, prep_side, ingredientName]
        );

        // Update the S3 object if a new file is uploaded
        if (file) {
            const uploadParams = {
                Bucket: bucketName,
                Body: file.data,
                Key: `${ingredientName.split(" ")[0]}.jpg`,
                ContentType: "image/jpeg",
            };
            await s3Client.send(new PutObjectCommand(uploadParams));
        }

        res.redirect("/");
    } catch (err) {
        console.error("Error editing ingredient:", err);
        res.status(500).send("Error editing ingredient.");
    }
});

// POST request made from remain list (adding sth to the shortage lst)
app.post("/remain/:name", async (req, res) => {
    var urgent = false;
    if (Object.keys(req.body)[0] === "urgent"){
        urgent = true;
    }
    const name = req.params.name;
    const prep_side = prep_side_dict[name]; // locate the genre so that we know to which kitchen we are sending
    // remove the ingredient from remain_lst
    if (name !== "米饭 Reis"){ // if it is not rice, remove it from remain_lst
        remain_lst = remain_lst.filter((remain) => {
            return remain !== name;
        });
        shortage_dict[name] = urgent;
    }else if (name in shortage_dict){ // if it is rice, remain it in remain_lst and shortage_dict["rice"] = # of rices needed
        shortage_dict[name] += 1;
    }else{
        shortage_dict[name] = 1;
    }
    
    // update the meat end if it is a meat; otherwise update the veg end
    if (prep_side === "meat"){
        try {
            const response = await axios.post(`http://localhost:${port}/addMeat`, {name: name, urgent: urgent});
        }catch (error){
            console.log(error);
        }
        
    }else{
        try{
            const response = await axios.post(`http://localhost:${port}/addVeg`, {name: name, urgent: urgent});
        }catch (error){
            console.log(error);
        }
    }
    const currentRoute = req.query.currentRoute || "/";
    res.redirect(currentRoute);
});

// POST request made from shortage list (removing sth from the shortage lst)
app.post("/shortage/:name", async (req, res)=>{
    const name = req.params.name;
    const prep_side = prep_side_dict[name]; // locate the genre so that we know to which kitchen we are sending
    // remove the ingredient from shortage_lst
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
            const response = await axios.post(`http://localhost:${port}/removeMeat`, {name: name});
        }catch (error){
            console.log(error);
        }
        
    }else{
        try{
            const response = await axios.post(`http://localhost:${port}/removeVeg`, {name: name});
        }catch (error){
            console.log(error);
        }
    }
    res.redirect("/"); // re-renders the front side page
    
})

server.listen(port, () => {
    console.log(`app listening on ${port}`);
});
