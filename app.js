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
const pgSession = require("connect-pg-simple")(session);

const app = express();

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded( { extended: true } ));

app.use(session({
    store: new pgSession({
        conString: `postgres://postgres:${process.env.PG_PW}@localhost/not_proj`
    }),
    secret: process.env.SESSION_SEC,
    resave: false,
    saveUninitialized: false,
    cookie: {
        //secure: true,             <-- activate when deploying
        maxAge: 180000 }
}));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: process.env.PG_DB,
    password: `${process.env.PG_PW}`,
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

async function updateWorkData(in_user_data, in_time_place_obj){
    try{
        let loc_data = JSON.parse(in_user_data['loc_data']);
        loc_data['last']['lat'] = in_time_place_obj['lat'];
        loc_data['last']['lon'] = in_time_place_obj['lon'];
        loc_data['last']['tmz_iana'] = in_time_place_obj['tmz_iana'];
        loc_data['last']['hour_offset'] = in_time_place_obj['hour_offset'];
        const weather_str = await weatherModule(in_time_place_obj['lat'], in_time_place_obj['lon'], in_time_place_obj['tmz_iana'], in_time_place_obj['local_hour']);
        if(weather_str){
            await db.query("UPDATE work_data SET (last_timestamp, last_local_hour, last_UTC_hour, weather, loc_data) = ($1,$2,$3,$4,$5) WHERE username = ($6)",
            [
                in_time_place_obj['timestamp'], in_time_place_obj['local_hour'], in_time_place_obj['UTC_hour'], weather_str, JSON.stringify(loc_data),
                in_user_data['username']
            ]);
        }
    } catch(err){ console.log('ERROR catched in updateWorkData:', err.message) }
}

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
            'INSERT INTO work_data VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
            [
                (new_id.rows[0]).id,                // user_id
                in_username,                        // username
                in_first_name,                      // first_name
                JSON.stringify({}),                 // notes
                JSON.stringify({}),                 // high_wly_mly
                JSON.stringify([]),                 // projects
                in_time_place_obj['timestamp'],     // last_timestamp
                in_time_place_obj['local_hour'],    // last_local_hour
                in_time_place_obj['UTC_hour'],      // last_UTC_hour
                weather_str,                        // weather
                JSON.stringify({                    // loc_data
                    'last':{
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana'],
                        'hour_offset': in_time_place_obj['hour_offset']
                    },
                    'original':{
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana'],
                        'hour_offset': in_time_place_obj['hour_offset']
                    }
                }),
                true,                               // temp_celsius
                false,                              // wtr_simple
            ]
        );
    }
};

app.get('/', (req, res) => {
    res.redirect('/login')
});

app.get('/login', (req, res) => {
    res.render('login', {})
});

app.get('/registration_successful', (req, res) => {
    res.render('registration_successful')
});

app.get('/home/:username', async (req, res) => {
    if (req.session){
        const username = req.user.username;
        const user_data_db_raw = await db.query("SELECT * FROM work_data WHERE username = ($1)", [username]);
        const user_data_db = user_data_db_raw.rows[0];
        console.log(typeof(user_data_db));
        console.log(user_data_db);
        const loc_data = JSON.parse(user_data_db.loc_data);
        const new_date = new Date();
        res.render('index', {
            user_timezone_PH : TIMEZONE, current_hour_PH : current_hour,
            dayA_PH : dayModule.dayA_pretty(new_date_mili), notesDayA_PH_string : JSON.stringify(notes_parsed[dayA_key]['notes']), dayA_hidden_date_PH : dayA_key,       // "_PH" is for PlaceHolder
            dayB_PH : dayModule.dayB_pretty(new_date_mili), notesDayB_PH_string : JSON.stringify(notes_parsed[dayB_key]['notes']), dayB_hidden_date_PH : dayB_key,
            dayC_PH : dayModule.dayC_pretty(new_date_mili), notesDayC_PH_string: JSON.stringify(notes_parsed[dayC_key]['notes']), dayC_hidden_date_PH : dayC_key,
            routines_raw_PH_string : JSON.stringify(routines_parsed), username_PH : realname, mili_diff_PH : mili_diff,
            projects_PH_string : JSON.stringify(projects_parsed), notes_PH_string : JSON.stringify(notes_parsed),
            days_7_PH : JSON.stringify(days_7) , days_31_PH : JSON.stringify(days_31),
            next_6h_PH : next_6h_string, next_day_PH : next_day_string, day3_PH : day3_string, wtr_simple_PH : wtr_simple, celsius_PH : celsius            
        })
    }else {
        console.log('User', req.user.username, 'redirected to login because there was not req.session');
        res.redirect('/login')
    }    
});

app.post('/login',
    passport.authenticate('local', { failureRedirect: '/fail' }), async function(req, res) {
        const user_data_page = req.body;
        const time_place_obj = JSON.parse(user_data_page.time_place_obj_str);
        const user_data_db_raw = await db.query("SELECT * FROM work_data WHERE username = ($1)",[user_data_page.username]);
        const user_data_db = user_data_db_raw.rows[0];
        const loc_data_db = (JSON.parse(user_data_db['loc_data']))["last"];
        if( time_place_obj['timestamp'] > (user_data_db['last_timestamp']+3600000) ||        // if 30min+ passed
            time_place_obj['lat'] - loc_data_db['lat'] < 0.2 ||
            loc_data_db['lat'] - time_place_obj['lat'] < 0.2 ||
            time_place_obj['lon'] - loc_data_db['lon'] < 0.2 ||
            loc_data_db['lon'] - time_place_obj['lon'] < 0.2 ||
            time_place_obj['UTC_hour'] != user_data_db['last_UTC_hour'] ){
            try{
                await updateWorkData(user_data_db, time_place_obj);
                res.redirect(`/home/${user_data_page.username}`)
            } catch (err){ console.log('ERROR catched in await updateWorkData in POST/login:', err.message)
                res.redirect('/login')
            }
        } else{
            res.redirect(`/home/${user_data_page.username}`)
        }        
    }
);

app.post('/register', (req, res) => {
    const cred_arr = JSON.parse(req.body.cred_arr_str);
    const time_place_obj = JSON.parse(req.body.time_place_obj_str);
    const first_name = req.body.first_name;
    bcrypt.hash( ( (cred_arr[1])+(process.env.PEP) ), saltRounds, async function(err, hash) {
        if(err){
            console.log('ERROR in bcrypt.hash in POST/register:', err.message);
            res.redirect('/registration_failed_A')
        } else{
            try{
                await registerUser( cred_arr[0], hash, first_name, time_place_obj );
                res.redirect('registration_complete')
            } catch (err){
                console.log('ERROR catched in registerUser() in POST/register:', err.message);
                res.redirect('/registration_failed_B')
            }
        }
    });
});

app.listen(3000, function(){
    console.log("listening on port 3000");
});