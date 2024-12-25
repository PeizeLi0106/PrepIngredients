import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import {WebSocketServer, WebSocket} from "ws";
import http from "http";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";

// 食材顺序，分区，color-coded
// sound cue


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const server = http.createServer(app);
const port = 3000;

const wss = new WebSocketServer({server});


app.use(bodyParser.urlencoded({ extended: true })); 
app.use(express.json());

// Enable Gzip compression
app.use(compression());

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

// Serve images with aggressive caching
app.use(
  "/images",
  express.static(path.join(__dirname, "public/images"), {
    maxAge: "1y", // Cache for 1 year
    immutable: true, // Files won't change
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);



// ingredients: a dict {ingredient_name: genre (meat or veg)}
// dictionary remains constant; each time renders the lists
// 肉: 1, 蔬菜: 2， 丸子: 3，海鲜: 4，菌类: 5，豆制品: 6，面制品: 7
// 香菇 for meat side, 乌冬面 for veg side (exceptions)
const ingredients_dict = {"牛肉": 1, "毛肚": 1, "菠菜": 2, "大白菜": 2, "羊肉": 1, "鱼丸": 3, "上海青": 2, "杏鲍菇": 5, "平菇": 5, "上海青": 2,"冻豆腐": 6,"香菇": 5,"茼蒿": 2,"菜心": 2,"金针菇": 5,"红薯": 2,"胡萝卜": 2,"南瓜": 2,"香菜": 2,"土豆": 2};
var remain_lst = Object.keys(ingredients_dict);
var shortage_dict = {}; // {name: urgency}
var meat_side_dict = {}; // {name: urgency}
var veg_side_dict = {}; // {name: urgency}



// Notify clients when a page is rendered
function notifyClients(page) {
    //console.log(`Number of clients connected: ${wss.clients.size}`);
    //console.log(`Notifying clients about page: ${page}`);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ page }));
        }
    });
}

app.get("/", (req, res) => {
    res.render("index.ejs", {remain: remain_lst, shortage: shortage_dict});
});

app.get("/meat", (req, res) => {
    res.render("meat.ejs", {meats: meat_side_dict});
    notifyClients('meat'); // Notify clients after rendering index.ejs

});

app.get("/veg", (req, res) => {
    res.render("veg.ejs", {vegs: veg_side_dict});
    notifyClients('veg'); // Notify clients after rendering index.ejs

});

// app.get("/search", (req, res) => {
//     const searchIngreName = req.query["name"];
//     let temp_lst = [];
//     if (remain_lst.includes(searchIngreName)){
//         temp_lst.push(searchIngreName);
//     }else{
//         temp_lst = remain_lst;
//     }
//     res.render("index.ejs", {remain: temp_lst, shortage: shortage_dict});
// });
app.get("/sortByMeat", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 1){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict});
    
});

app.get("/sortByVeg", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 2){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict});
});
app.get("/sortByBall", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 3){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict});
});
app.get("/sortBySeafood", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 4){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict});
});
app.get("/sortByFungi", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 5){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict});
});
app.get("/sortByBean", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 6){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict});
});
app.get("/sortByNoodle", (req, res) => {
    let vLst = [];
    for (const rems of remain_lst){
        if (ingredients_dict[rems] === 7){
            vLst.push(rems);
        }
    }
    res.render("index.ejs", {remain: vLst, shortage: shortage_dict});
});

// meat: remain -> shortage
app.post("/addMeat", (req, res) => {
    const name = req.body.name;
    const urgent = req.body.urgent;
    meat_side_dict[name] = urgent;
    //console.log(meat_side_dict)
    res.redirect("/meat");
})

app.post("/addVeg", (req, res) => {
    const name = req.body.name;
    const urgent = req.body.urgent;
    veg_side_dict[name] = urgent;
    //console.log(veg_side_dict)
    res.redirect("/veg");
})

// meat: shortage -> remain
app.post("/removeMeat", (req, res) => {
    const name = req.body.name;
    delete meat_side_dict[name];
    res.redirect("/meat");

})

// veg: shortage -> remain
app.post("/removeVeg", (req, res) => {
    const name = req.body.name;
    delete veg_side_dict[name];
    res.redirect("/veg");
})

// POST request made from remain list (adding sth to the shortage lst)
app.post("/remain/:name", async (req, res) => {
    var urgent = false;
    //console.log(Object.keys(req.body)[0]);
    if (Object.keys(req.body)[0] === "urgent"){
        urgent = true;
    }
    //console.log(urgent);
    const name = req.params.name;
    const genre = ingredients_dict[name]; // locate the genre so that we know to which kitchen we are sending
    // remove the ingredient from remain_lst
    remain_lst = remain_lst.filter((remain) => {
        return remain !== name;
    });
    shortage_dict[name] = urgent;
    // update the meat end if it is a meat; otherwise update the veg end
    if (genre === 1 || genre === 3 || genre === 4 || genre === 6 || (genre === 7 && name !== "乌冬面") || (genre === 5 && name === "香菇")){
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
    res.redirect("/"); // re-renders the front side page

});

// POST request made from shortage list (removing sth from the shortage lst)
app.post("/shortage/:name", async (req, res)=>{
    const name = req.params.name;
    const genre = ingredients_dict[name]; // locate the genre so that we know to which kitchen we are sending
    // remove the ingredient from shortage_lst
    delete shortage_dict[name];
    remain_lst = [...remain_lst, name]; // add the ingredient back to the remain_lst
    // update the meat end if it is a meat; otherwise update the veg end
    if (genre === 1 || genre === 3 || genre === 4 || genre === 6 || (genre === 7 && name !== "乌冬面") || (genre === 5 && name === "香菇")){
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
/*
    review list serves as a mental checklist for people who work in back kitchen in case they lose track of items they are preparing
 */
// app.post("/vegReview/:name",(req, res) => {
//     const name = req.params.name;
//     veg_review_lst.push(name);
//     delete veg_side_dict[name];
//     res.redirect("/veg");
// });

// app.post("/meatReview/:name", (req, res) => {
//     const name = req.params.name;
//     meat_review_lst.push(name);
//     delete meat_side_dict[name];
//     res.redirect("/meat");
// });

server.listen(port, () => {
    console.log(`app listening on ${port}`);
});
