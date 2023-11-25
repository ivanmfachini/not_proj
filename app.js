require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const session = require("express-session");
const passport  = require("passport");
const pg = require("pg");
const bcrypt = require('bcrypt');
const saltRounds = 3;
const LocalStrategy = require('passport-local');
//const pgSession = require("connect-pg-simple")(session);

const app = express();

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded( { extended: true } ));

app.use(session({
    //store: new pgSession(),
    secret: process.env.SESSION_SEC,
    resave: false,
    saveUninitialized: false,
    cookie: {
        //secure: true,             <-- activate when deploying
        maxAge: 60000 }
}));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: process.env.PG_DB,
    password: process.env.PG_PW,
    port: 5432,
});
db.connect();

async function verifyPassword(in_password, in_hash){
    return new Promise((resolve, reject) =>{
        bcrypt.compare(in_password, in_hash, function(err, result) {
            if (err){ console.log('ERROR in bcrypt.compare in verifyPassword():', err.message);
                resolve(false)
            } else if (result){ console.log('FUNCTION verifypassword(): password is CORRECT');
                resolve(true)
            } else { console.log('FUNCTION verifypassword(): password is WRONG');
                resolve(false)
            }
        });
    })
};

passport.use(new LocalStrategy(
    async function(username, password, done) {
        //User.findOne({ username: username }, function (err, user) {
        console.log('LocalStrategy, username is:', username, ' | password is:', password);
        await db.query('SELECT * FROM credential WHERE username = ($1)', [username], async function (err,user){
            if (err) { console.log('ERROR in db.query in LocalStrategy:', err.message);
                return done(err)
            } else{
                try{ user = user.rows[0]
                } catch (err){ console.log('ERROR catched in try{ user = user.rows[0]:', err.message);
                    return done(null,false)
                };
                if (!user) { console.log('LocalStrategy: db.query returned no user');
                    return done(null, false)
                };
                let result = await verifyPassword( (password + (process.env.PEP)), user['password'] );
                if (result) {
                    console.log('LocalStrategy --> verifyPassword returned true, returning user');
                    return done(null, user)
                } else{
                    console.log('LocalStrategy --> verifyPassword returned false, returning false');
                    return done(null, false)
                }
            }
        });
    }
));

passport.serializeUser(function(user, done) {
    console.log('serializeUser:', user);
    done(null, user.id);
});
  
passport.deserializeUser(async function(id, done) {
    console.log('deserializeUser with id:', id);
    //User.findById(id, function (err, user) {
    await db.query('SELECT * FROM credential WHERE id = ($1)', [id], function (err,user){
        if (err){ console.log('ERROR in db.query in deserializeUser:', err.message) }
        done(err, (user.rows[0]));
    });
});

const dayModule = require(__dirname + "/dayModule.js");
const weatherModule = require(__dirname + "/weatherModule.js");

async function queryAccId(in_id){
    const result_obj = await db.query( "SELECT * FROM account WHERE id = ($1)", [in_id]);
    return (result_obj.rows)[0]
};

async function queryAccUsername(in_username){
    const result_obj = await db.query( "SELECT * FROM account WHERE username = ($1)", [in_username]);
    return (result_obj.rows)[0]
};

async function queryWorkDataId(in_id){
    const result_obj = await db.query( "SELECT * FROM user_data WHERE id = ($1)", [in_id]);
    return (result_obj.rows)[0]
};

async function queryWorkDataUsername(in_username){
    const result_obj = await db.query( "SELECT * FROM user_data WHERE username = ($1)", [in_username]);
    return (result_obj.rows)[0]
};

async function queryCredential(in_username, in_password){
    const result_obj = await db.query( "SELECT id FROM credential WHERE (username, password) = ($1, $2)",
    [in_username, in_password]);
    return (result_obj.rows)[0]
};

async function registerUser(in_username, in_hash, in_first_name, in_time_place_obj){
    let new_id = await db.query(
        'INSERT INTO credential(username, password) VALUES ($1, $2) RETURNING id;', [in_username, in_hash]
    );
    await db.query(
        'INSERT INTO account(user_id, username, first_name, first_pw, creation) VALUES ($1, $2, $3, $4, $5);',
        [((new_id.rows[0]).id), in_username, in_first_name, in_hash, in_time_place_obj['timestamp']]
    );
    let weather_str;
    try{
        weather_str = await weatherModule(in_time_place_obj['lat'], in_time_place_obj['lon'], in_time_place_obj['tmz_iana'], in_time_place_obj['local_hour'])
    } catch{
        console.log('weatherModule did not return a value for user', in_username + '. Will insert empty array instead')
        weather_str = JSON.stringify([])
    } finally{
        await db.query(
            'INSERT INTO work_data VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [
                (new_id.rows[0]).id,                // user_id
                in_username,                        // username
                in_first_name,                      // first_name
                JSON.stringify({}),                 // notes
                JSON.stringify({}),                 // high_wly_mly
                JSON.stringify([]),                 // projects
                in_time_place_obj['timestamp'],     // last_timestamp
                in_time_place_obj['local_hour'],    // last_hour
                weather_str,                        // weather
                JSON.stringify({                    // loc_data
                    'last':{
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana']
                    },
                    'original':{
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana']
                    }
                }),
                true,                               // temp_celsius
                false                               // wtr_simple
            ]
        );
    }
};

/* function isAuthenticated(req, res, next){
    console.log('entered isAuthenticated');
    if (req.session.user) next()
    else next('/login')
}; */  

app.get('/', (req, res) => {
    res.redirect('/login')        
});

app.get('/login', (req, res) => {
    res.render('login', {})
});

app.get('/registration_successful', (req, res) => {
    res.render('registration_successful');
});

/* app.post('/login', async function (req, res) {
    let cred_arr = JSON.parse(req.body.cred_arr_str);
    let time_lace_obj = JSON.parse(req.body.time_place_obj_str);
    const result = await db.query('SELECT * FROM credential WHERE username = ($1)',[cred_arr[0]]);
    if(result.rows.length){
        const match = await bcrypt.compare( ((cred_arr[1])+(process.env.PEP)) , result.rows[0]['password'] );
        if(match) {

        } else{
            console.log('WRONG PASSWORD')
        }
    } else{
        console.log('no such user')
    }
}); */

app.post('/login', 
    passport.authenticate('local', { failureRedirect: '/fail' }), function(req, res) {
        console.log('CORRECT?');
        res.redirect('/');
    }
);

app.post('/register', (req, res) => {
    let cred_arr = JSON.parse(req.body.cred_arr_str);
    let time_lace_obj = JSON.parse(req.body.time_place_obj_str);
    let first_name = req.body.first_name;
    bcrypt.hash( ( (cred_arr[1])+(process.env.PEP) ), saltRounds, async function(err, hash) {
        if(err){
            console.log('ERROR in bcrypt.hash in /register:', err.message);
            res.redirect('/registration_failed_A')
        } else{
            try{
                await registerUser( cred_arr[0], hash, first_name, time_lace_obj );
                res.redirect('registration_complete')
            } catch (err){
                console.log('ERROR in registerUser() in /register:', err.message);
                res.redirect('/registration_failed_B')
            }
        }
    });
});

app.listen(3000, function(){
    console.log("listening on port 3000");
});