require('dotenv').config();
const express = require("express");
const session = require("express-session");
const passport  = require("passport");
const pg = require("pg");
const ejs = require("ejs");
const bodyParser = require("body-parser");
const axios = require("axios");

const bcrypt = require('bcrypt');
const saltRounds = 3;
const myPlaintextPassword = 's0/\/\P4$$w0rD';
const someOtherPlaintextPassword = 'not_bacon';

const app = express();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SEC,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000 }
}));
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: process.env.PG_DB,
    password: process.env.PG_PW,
    port: 5432,
});
db.connect();

const dayModule = require(__dirname + "/dayModule.js");


async function queryAccId(in_id){
    const result_obj = await db.query( "SELECT * FROM account WHERE id = ($1)", [in_id]);
    return (result_obj.rows)[0]
};

async function queryAccUsername(in_username){
    const result_obj = await db.query( "SELECT * FROM account WHERE username = ($1)", [in_username]);
    return (result_obj.rows)[0]
};

async function queryUserDataId(in_id){
    const result_obj = await db.query( "SELECT * FROM user_data WHERE id = ($1)", [in_id]);
    return (result_obj.rows)[0]
};

async function queryUserDataUsername(in_username){
    const result_obj = await db.query( "SELECT * FROM user_data WHERE username = ($1)", [in_username]);
    return (result_obj.rows)[0]
};

async function insertCredential(in_username, in_hash){
    await db.query('INSERT INTO credential(username, password) VALUES ($1, $2)', [in_username, in_hash] )
};

app.get('/', (req, res) => {
    res.redirect('/login')        
});

app.get('/login', (req, res) => {
    res.render('login', {})
});

app.post('/login', (req, res) => {

});

app.post('/register', async (req, res) => {
    let register_arr = JSON.parse(req.body.register_array);
    let login_arr = JSON.parse(req.body.login_array);
    bcrypt.hash( ((register_arr[1])+(process.env.PEP)), saltRounds, async function(err, hash) {
        await registerNewUser( register_arr[0], hash )
    });
});



app.listen(3000, function(){
    console.log("listening on port 3000");
});