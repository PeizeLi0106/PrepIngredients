import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import {WebSocketServer, WebSocket} from "ws";
import http from "http";
import path from "path";

import { fileURLToPath } from "url";

// dotenv.config();
// const port = process.env.PORT;
// const bucketName = process.env.BUCKET_NAME;
// const bucketRegion = process.env.BUCKET_REGION;
// const accessKey = process.env.ACCESS_KEY;
// const secretAccessKey = process.env.SECRET_ACCESS_KEY;

// const s3 = new S3Client({
//     credentials: {
//         accessKeyId: accessKey,
//         secretAccessKey: secretAccessKey,
//     },
//     region: bucketRegion,
// });


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = 3000;

const server = http.createServer(app);

const wss = new WebSocketServer({server});


app.use(bodyParser.urlencoded({ extended: true })); 
app.use(express.json());


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


// ingredients: a dict {ingredient_name: genre (meat or veg)}
// dictionary remains constant; each time renders the lists
// 肉: 1, 蔬菜: 2，丸子: 3，海鲜: 4，菌类: 5，豆制品: 6，面制品: 7
// 香菇 for meat side, 乌冬面 for veg side (exceptions)
const ingredients_dict = {"牛肉 Rindfleisch": 1, "五香牛腱子 Gewürzte-Rindfleisch": 1, "鸡腿肉 Gekochtes-Hähnchenfleisch": 1, "鸡胸肉 Hühnerbrust": 1, 
    "素肉 Sojafasern": 1, "五香牛蹄筋 Gewürzte-Rindersehne": 1, "卤大肠 Schweinedarm": 1, "牛肉卷 Rindfleisch-Rolle": 1, "烤鸭 Entenfleisch": 1, 
    "白百叶 Frische-Rindskutteln": 1, "黄喉 Rinderhals": 1, "辣牛肉 scharf-Rindfleisch": 1, "凤爪 Hühnerfüße": 1, "羊肉卷 Lammfleisch-Rolle": 1, 
    "牛蛙 Ochsenfrosch": 1, "鸭胗 Entenmagen": 1, "卤猪肚 Marinierte-Schweinemagen": 1, "黑百叶 Schwarzer-Rindermagen": 1, "上海青 Pak-Choi": 2, "大白菜 Chinakohl": 2, 
    "生菜 Blattsalat": 2, "菠菜 Spinat": 2, "茼蒿 Tong-Ho": 2, "莲藕 Lotuswurzel": 2, "西兰花 Brokkoli": 2, "香菜 Koriander": 2, "白萝卜 Rettich": 2, 
    "菊苣 Chicorée": 2, "土豆 Kartoffeln": 2, "胡萝卜 Karotten": 2, "红薯 Süßkartoffel": 2, "黄花菜 Getrocknete-Taglilien": 2, 
    "竹笋 Bambus": 2, "山药 Yamswurzel": 2, "南瓜 Kürbis": 2, "芋头 Taro": 2, "豆芽 Sojasprossen": 2, "冬瓜 Wintermelone": 2, 
    "平菇 Austernpilze": 2, "杏鲍菇 Königsausternpilze": 2, "玉米尖 Mais-Sprossen": 2, "菜心 Choy-sum": 2, "土耳其白卷心菜 Türkischer-Spitzkohl": 2, 
    "菜花 Blumenkohl": 2, "油麦菜 Chinesischer-Salat": 2, "荷兰豆 Kaiserschoten": 2, "黄瓜条 Gurke": 2, "玉米 Mais": 2, "贡菜 Berggelee-Gemüse": 2, "芋仔 kleine-Taro-Knollen": 2,
    "鲜鱼丸 Fischbällchen": 3, "午餐肉 Frühstücksfleisch": 3, "墨鱼丸 Tintenfischbällchen": 3, "牛筋丸": 3, "煎鸡蛋 Spiegelei": 3, "鸡肉小香肠 Hähnchenwürstchen": 3, 
    "虾丸 Garnelenbällchen": 3, "日本熏肠 Japanische-Räucherwurst": 3, "猫爪虾丸 Katzenpfoten-Garnelenbällchen": 3, "溏心卤蛋 Marinierte-Eier": 3, 
    "鱼豆腐 Fisch-Tofu": 3, "竹轮烧 Chikuwa": 3, "福州鱼丸 Fuzhou-Fischbällchen": 3, "鸡肉香肠 Hähnchenwurst": 3, "贡丸 Schweinefleisch-gefüllte-Bällchen": 3, 
    "蟹棒 Surimi-Sticks": 3, "牛肉丸 Rindfleischbällchen": 3, "火腿肠 Schinkenwurst": 3,"海带 Seetang": 4, "章鱼 Oktopus": 4, 
    "巴沙鱼 Pangasius-Fisch": 4, "青口贝 Miesmuschel": 4, "大虾 Garnelen": 4, "虾仁 Geschälte-Garnelen": 4, "鲈鱼 Zanderfilet": 4, "鱿鱼花 Tintenfisch": 4, 
    "金针菇 Enokipilze": 5, "鸿喜菇 Buchenpilz": 5, "羊肚菌 Morcheln": 5, "木耳 Mu-Err-Pilz": 5, "香菇 Shiitake-Pilz": 5, "腌蘑菇 eingelegte-Champignons": 5,
    "鸭血豆腐 Entenblut-Tofu": 6, "猪血豆腐 Schweineblut-Tofu": 6, "腐竹 Getrocknete-Tofustangen": 6, "鲜豆腐 Tofu": 6, "豆腐丝 Tofu-Streifen": 6, 
    "冻豆腐 Gefrorener-Tofu": 6, "豆腐皮 Tofuhaut": 6, "豆腐泡 Frittierter-Tofu": 6, "乌冬面 Udon-Nudeln": 7, "鸡肉饺子 Hühnerfleisch-Maultaschen": 7, 
    "素三鲜水饺 Vegetarische-Maultaschen": 7, "鸡肉虾仁馄饨 Wan-Tan": 7, "黄金蛋饺 Hähnchen-Ei-Maultaschen": 7, "功夫番茄牛肉饺子 Rindfeisch-Tomate-Maultaschen": 7, 
    "米粉 Reisnudeln": 7, "火锅川粉 Breite-Süßkatorffelnudeln": 7, "韩式素煎饺 Vegetarische-Koreanische-Mandu": 7, 
    "鸡蛋面 Eiernudeln ": 7, "油条 Frittierte-Teigstangen": 7, "河粉 Reisbandnudeln": 7, "妈妈面 Mama-Nudeln": 7, "新鲜面条 Handgemachte-Nudeln": 7, 
    "韩式南瓜面条 Koreanische-Kürbisnudeln": 7, "菠菜面条 Spinatnudeln": 7, "方便面 Instantnudeln": 7, "韩式面条 Koreanische-Ramen": 7, "紫薯面条 Lila-Süßkartoffelnudeln": 7, 
    "阳春面 Yamsnudeln": 7, "刀削面 Dao-Xiao-Mian": 7, "南瓜面条 Kürbisnudeln": 7, "荞麦面 Buchweizennudeln": 7, "荞麦方便面 Buchweizen-Instantnudeln": 7, "红薯粉丝 Süßkartoffeln-Glassnudeln": 7, 
    "年糕 Reiskuchen": 7, "魔芋面 Konjaknudeln": 7, "魔芋结 Konjak-Knoten": 7, "韩国年糕条 Reiskuchen-Streifen ": 7, "韩国泡菜饺子 Koreanische-Kimchi-Teigtaschen": 7};
var remain_lst = Object.keys(ingredients_dict);
var shortage_dict = {}; // {name: urgency}
var meat_side_dict = {}; // {name: urgency}
var veg_side_dict = {}; // {name: urgency}



// Notify clients when a page is rendered
function notifyClients(action, page) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ action, page }));
        }
    });
}
// meat: remain -> shortage
app.post("/addMeat", (req, res) => {
    const name = req.body.name;
    const urgent = req.body.urgent;
    meat_side_dict[name] = urgent;
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
    delete meat_side_dict[name];
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



// POST request made from remain list (adding sth to the shortage lst)
app.post("/remain/:name", async (req, res) => {
    var urgent = false;
    //console.log(Object.keys(req.body)[0]);
    if (Object.keys(req.body)[0] === "urgent"){
        urgent = true;
    }
    //console.log(urgent);
    const name = req.params.name;
    //console.log(name);
    const genre = ingredients_dict[name]; // locate the genre so that we know to which kitchen we are sending
    //console.log(genre);
    // remove the ingredient from remain_lst
    remain_lst = remain_lst.filter((remain) => {
        return remain !== name;
    });
    shortage_dict[name] = urgent;
    // update the meat end if it is a meat; otherwise update the veg end
    if (genre === 1 || (genre === 2 && (name === "玉米" || name === "贡菜" || name === "芋仔")) || genre === 3 || genre === 4 || (genre === 5 && (name === "香菇" || name === "木耳" || name === "腌蘑菇")) || genre === 6 || (genre === 7 && name !== "乌冬面")){
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
    const genre = ingredients_dict[name]; // locate the genre so that we know to which kitchen we are sending
    // remove the ingredient from shortage_lst
    delete shortage_dict[name];
    remain_lst = [...remain_lst, name]; // add the ingredient back to the remain_lst
    // update the meat end if it is a meat; otherwise update the veg end
    if (genre === 1 || (genre === 2 && (name === "玉米" || name === "贡菜" || name === "芋仔")) || genre === 3 || genre === 4 || (genre === 5 && (name === "香菇" || name === "木耳" || name === "腌蘑菇")) || genre === 6 || (genre === 7 && name !== "乌冬面")){
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
