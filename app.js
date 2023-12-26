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
const fsPromises = require("fs").promises;
const path = require("path");
const { error } = require('console');
var GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true } ));

app.use(session({
    store: new pgSession({
        conString: `postgres://imanastronaut:${process.env.PG_PW}@${process.env.HOSTNAME}/${process.env.PG_DB}`
    }),
    secret: process.env.SESSION_SEC,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 28800000 }
}));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: "imanastronaut",
    host: process.env.HOSTNAME,
    database: process.env.PG_DB,
    password: process.env.PG_PW,
    port: 5432,
});
db.connect();

async function createTables(){
    return new Promise( async (resolve,reject)=>{
        try{
            await db.query("CREATE TABLE credential(id SERIAL PRIMARY KEY, username VARCHAR(30) UNIQUE NOT NULL, password TEXT NOT NULL);");
            await db.query("CREATE TABLE account (user_id INTEGER, username VARCHAR(30), log_fail numeric(13,0), log_attempt smallint, log_ok numeric(13,0), log_forbid integer, pw_last_change numeric(13,0), prev_pw TEXT, first_pw TEXT NOT NULL, creation numeric(13,0) NOT NULL, other TEXT, CONSTRAINT account_pkey PRIMARY KEY (user_id), CONSTRAINT account_username_key UNIQUE (username), CONSTRAINT account_user_id_fkey FOREIGN KEY(user_id) REFERENCES credential(id) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT account_username_fkey FOREIGN KEY (username) REFERENCES credential(username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE);");
            await db.query("CREATE TABLE work_data (user_id INTEGER, username VARCHAR(30), first_name VARCHAR(20), notes TEXT, high_wly_mly TEXT, projects TEXT, last_timestamp numeric(13,0), last_local_hour numeric(2,0), last_UTC_hour numeric(2,0), weather TEXT, loc_data TEXT, temp_celsius boolean NOT NULL DEFAULT true, wtr_simple boolean NOT NULL DEFAULT false, surname VARCHAR(80), email VARCHAR(80), phone VARCHAR(30), lang VARCHAR(3) DEFAULT 'eng', CONSTRAINT work_data_pkey PRIMARY KEY (user_id), CONSTRAINT work_data_username_key UNIQUE (username), CONSTRAINT work_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES credential(id) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE, CONSTRAINT work_data_username_fkey FOREIGN KEY (username) REFERENCES credential(username) MATCH SIMPLE ON UPDATE CASCADE ON DELETE CASCADE);");
            await db.query('CREATE TABLE "session" ("sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL) WITH (OIDS=FALSE); ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE; CREATE INDEX "IDX_session_expire" ON "session" ("expire");')
            resolve(true)
        } catch (err){
            console.log('ERROR at createTables:', err.message);
            resolve(false)
        }
    })
};

async function writeLog(in_message, in_id, is_error = true){
    const new_date = new Date();
    if (is_error){
        try{
            await fsPromises.appendFile(path.join(__dirname, 'logs','error_logs.txt'), ("\n"+in_message+','+in_id+','+new_date.getTime()+','+new_date.toUTCString()))
        } catch (err){ console.error(err) }
    } else{
        try{
            await fsPromises.appendFile(path.join(__dirname, 'logs','non_error_logs.txt'), ("\n"+in_message+','+in_id+','+new_date.getTime()+','+new_date.toUTCString()))
        } catch (err){ console.error(err) }
    }
};

async function verifyPassword(in_password, in_hash){
    return new Promise((resolve, reject) =>{
        bcrypt.compare(in_password, in_hash, async function(err, result) {
            if (err){ console.log('ERROR in bcrypt.compare in verifyPassword():', err.message);
                await writeLog('ERROR in bcrypt.compare in verifyPassword():'+err.message,0,true);
                resolve(false)
            } else if (result){ resolve(true) }
            else { resolve(false) }
        });
    })
};

passport.serializeUser(function(user, done) {
    done(null, user.id);
});
  
passport.deserializeUser(async function(id, done) {
    await db.query('SELECT * FROM credential WHERE id = ($1)', [id], async function (err,user){
        if (err){ console.log('ERROR in db.query in deserializeUser:', err.message);
            await writeLog('ERROR in db.query in deserializeUser: '+err.message,id,true);
        };
        done(err, (user.rows[0]));
    });
});

function createFedCred(){
    try{
        db.query("CREATE TABLE federated_credentials (user_id INTEGER UNIQUE NOT NULL, provider TEXT, subject TEXT);")
    } catch(err){
        console.log('ERROR while creating fed_cred:', err.message)
    }
};
//createFedCred();

function deleteFromTables(){
    try{
        db.query("DELETE FROM federated_credentials; DELETE FROM session; DELETE FROM work_data; DELETE FROM account; DELETE FROM credential");
    } catch(err){
        console.log('ERROR while deleting from tables:', err.message)
    }
};
deleteFromTables();

async function registerUser(in_username, in_hash, in_first_name, in_time_place_obj = false, in_demo_obj = false){
    console.log('>>> FUNCTION registerUser(', in_username, in_hash, in_first_name, in_time_place_obj, in_demo_obj,')');
    let new_id, result_ct;
    try{
        new_id = await db.query(
            'INSERT INTO credential(username, password) VALUES ($1,$2) RETURNING id;', [in_username, in_hash]
        )
    } catch(err){
        console.log('ERROR while trying to query INSERT INTO credential. Calling createTables...:', err.message);
        result_ct = await createTables();
        if (result_ct){ console.log('successfully created tables') }
        else{ console.log('failed creating tables') }
    } finally{
        if(result_ct){
            new_id = await db.query(
                'INSERT INTO credential(username, password) VALUES ($1,$2) RETURNING id;', [in_username, in_hash]
            )
        };
        let itpo_timestamp;
        if (in_time_place_obj){ itpo_timestamp = in_time_place_obj['timestamp'] }
        else{ itpo_timestamp = Date.now() } 
        await db.query(
            'INSERT INTO account(user_id, username, first_pw, creation) VALUES ($1,$2,$3,$4);',
            [((new_id.rows[0]).id), in_username, in_hash, itpo_timestamp],
            async (err, result)=>{
                if(err){ console.log('ERROR in db.query in registerUser:', err.message)
                    await writeLog('ERROR in db.query in registerUser:'+err.message,in_username,true)
                }
            }
        );
    };
    let weather_str;
    if (in_time_place_obj){
        try{
            weather_str = await weatherModule(in_time_place_obj['lat'], in_time_place_obj['lon'], in_time_place_obj['tmz_iana'], in_time_place_obj['local_hour'])
        } catch (err){
            await writeLog('weather did not came back', in_username, false);
            weather_str = JSON.stringify([])
        }
    } else{ weather_str = JSON.stringify([]) }
    
    if (!in_demo_obj){
        await db.query(
            'INSERT INTO work_data VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
            [
                (new_id.rows[0]).id,                // user_id                      1
                in_username,                        // username                     2
                in_first_name,                      // first_name                   3
                JSON.stringify({}),                 // notes                        4
                JSON.stringify({}),                 // high_wly_mly                 5
                JSON.stringify([]),                 // projects                     6
                in_time_place_obj['timestamp'],     // last_timestamp               7
                in_time_place_obj['local_hour'],    // last_local_hour              8
                in_time_place_obj['UTC_hour'],      // last_UTC_hour                9
                weather_str,                        // weather                      10
                JSON.stringify({                    // loc_data                     11
                    'last':{
                        'YYYY-MM-DD': in_time_place_obj['YYYY-MM-DD'],
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana'],
                        'hour_offset': in_time_place_obj['hour_offset'],
                        'tmz_suffix': in_time_place_obj['tmz_suffix']
                    },
                    'original':{
                        'YYYY-MM-DD': in_time_place_obj['YYYY-MM-DD'],
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana'],
                        'hour_offset': in_time_place_obj['hour_offset'],
                        'tmz_suffix': in_time_place_obj['tmz_suffix']
                    }
                }),
                true,                               // temp_celsius                 12
                false,                              // wtr_simple                   13
                "","","",                           // surname, email, phone        14, 15, 16
                "eng"                               // lang                         17
            ]
        )
        return ((new_id.rows[0]).id)
    } else{
        await db.query(
            'INSERT INTO work_data VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
            [
                (new_id.rows[0]).id,                // user_id                      1
                in_username,                        // username                     2
                in_first_name,                      // first_name                   3
                in_demo_obj['demo_notes_str'],      // notes                        4
                in_demo_obj['demo_routines_str'],   // high_wly_mly                 5
                in_demo_obj['demo_projects_str'],   // projects                     6
                in_time_place_obj['timestamp'],     // last_timestamp               7
                in_time_place_obj['local_hour'],    // last_local_hour              8
                in_time_place_obj['UTC_hour'],      // last_UTC_hour                9
                weather_str,                        // weather                      10
                JSON.stringify({                    // loc_data                     11
                    'last':{
                        'YYYY-MM-DD': in_time_place_obj['YYYY-MM-DD'],
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana'],
                        'hour_offset': in_time_place_obj['hour_offset'],
                        'tmz_suffix': in_time_place_obj['tmz_suffix']
                    },
                    'original':{
                        'YYYY-MM-DD': in_time_place_obj['YYYY-MM-DD'],
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana'],
                        'hour_offset': in_time_place_obj['hour_offset'],
                        'tmz_suffix': in_time_place_obj['tmz_suffix']
                    }
                }),
                true,                               // temp_celsius                 12
                false,                              // wtr_simple                   13
                "Some Surnames","optional@provider.com","+55 (48) 98765-43210",// surname, email, phone 14, 15, 16
                "eng"                               // lang                         17
            ]
        )
        return ((new_id.rows[0]).id)
    }
};

passport.use(new GoogleStrategy({
    clientID: process.env.G_AUTH_CLIENT_ID,
    clientSecret: process.env.G_AUTH_CLIENT_SECRET,
    callbackURL: "https://ivanmfac.onrender.com/oauth_google",
    scope: [ 'profile' ],
    state: true
    },
    async function verify(accessToken, refreshToken, profile, cb) {
        console.log('############################## profile:'); console.log(profile);
        let sel_fed;
        let this_suffix = (Date.now()-1703000000000).toString(16);
        try{
            await db.query('SELECT * FROM federated_credentials WHERE (provider, subject) = ($1,$2)',
            ['https://accounts.google.com', profile.id], async function(err, sel_fed_res) {
                if (err) {
                    console.log('ERROR while SELECT * FROM federated_credentials in verify using google auth:', err.message);
                    return cb(err)
                };
                sel_fed = sel_fed_res;
                console.log('############################## sel_fed:'); console.log(sel_fed);
                if (!sel_fed || !sel_fed.rows || !sel_fed.rows.length) {
                    // The account at Google has not logged in to this app before.  Create a new user record and associate it with the Google account.
                    let this_username = profile.name.givenName+"_NP_"+this_suffix;
                    bcrypt.hash( ( (this_suffix)+(process.env.PEP) ), saltRounds, async function(err_hash, hash) {
                        if(err_hash){
                            console.log('ERROR in bcrypt.hash in verify from google strategy:', err_hash.message);
                            await writeLog('ERROR in bcrypt.hash in verify from google strategy:'+err_hash.message, 0, true);
                            return cb(err_hash)
                        } else{
                            let this_id = await registerUser(this_username, hash, (profile.name.givenName));
                            console.log('>>>>>>>>>>>>>>>>>>>>>> this_id is:', this_id)
                            await db.query('INSERT INTO federated_credentials (user_id, provider, subject) VALUES ($1,$2,$3) RETURNING *;',
                            [this_id, 'https://accounts.google.com', profile.id ], function(err3, fed_result) {
                                if (err3) {
                                    console.log('ERROR while INSERT INTO federated_credentials in verify using google auth:', err3.message);
                                    return cb(err3)
                                };
                                console.log('############################ fed_result:');
                                console.log(fed_result);
                                g_user = {
                                    id: this_id,
                                    name: profile.name.givenName+"_NP"
                                };
                                console.log('############################ g_user:');
                                console.log(g_user);
                                return cb(null, g_user)
                            })
                        }
                    });
                    /* await db.query('INSERT INTO credential(username, password) VALUES ($1,$2) RETURNING id;',
                    [this_username,'google_oauth'], async function(err2, id_result) {
                        if (err2) {
                            console.log('ERROR while INSERT INTO credential in verify using google auth:', err2.message);
                            return cb(err2)
                        };
                        console.log('############################## id_result is:'); console.log(id_result);
                        let this_id = id_result.rows[0].id;
                        console.log('############################## this_id is:'); console.log(this_id); */
                    //});
                } else{
                    // The account at Google has previously logged in to the app.  Get the user record associated with the Google account and log the user in.
                    await db.query('SELECT * FROM credential WHERE id = $1', [ sel_fed.rows[0].user_id ], function(err, user) {
                        if (err) {
                            console.log('ERROR while SELECT * FROM credential in verify using google auth:', err.message);
                            return cb(err)
                        } else if (!user) {
                            console.log('USER NOT FOUND in SELECT * FROM credential in verify using google auth:', err.message);
                            return cb(null, false)
                        };
                        return cb(null, user)
                    })
                }
            })
        } catch (err){
            console.log('ERROR (2) while SELECT * FROM federated_credentials in verify using google auth:', err.message);
            return cb(err)
        };
    }
));

passport.use(new LocalStrategy(
    async function(username, password, done) {
        //User.findOne({ username: username }, function (err, user) {
        await db.query('SELECT * FROM credential WHERE username = ($1)', [username], async function (err,user){
            if (err) { console.log('ERROR in db.query in LocalStrategy:', err.message);
                await writeLog('ERROR in db.query in LocalStrategy:'+err.message,username,true);
                return done(err)
            } else {
                if (!user) { console.log('no user found in localStrategy'); return done(null, false) };
                let result_l;
                let user_found = user.rows[0];
                try{
                    console.log(user_found);
                    result_l = await verifyPassword( (password + (process.env.PEP)), user_found['password'] );
                } catch(err2){
                    console.log('ERROR while verifyPassword() in localStrategy:', err2.message)
                }finally{
                    if (result_l) { console.log('result_l was true'); return done(null, user_found) }
                    else{ console.log('result_l was false'); return done(null, false) }
                }
            }
        });
    }
));

const dayModule = require(__dirname + "/dayModule.js");
const weatherModule = require(__dirname + "/weatherModule.js");
var demo_username;

/////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////    FUNCTIONS    //////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

async function queryAccId(in_id){
    return new Promise((resolve, reject)=>{
        db.query( "SELECT * FROM account WHERE id = ($1)", [in_id], async (err, result)=>{
            if (err){ console.log('ERROR in db.query in queryAccId:', err.message);
                await writeLog('ERROR in db.query in queryAccId:'+err.message, in_id, true);
                resolve(false)
            } else{ resolve((result.rows)[0]) }
        })        
    })
};

async function queryAccUsername(in_username){
    return new Promise((resolve, reject)=>{
        db.query( "SELECT * FROM account WHERE username = ($1)", [in_username], async (err, result)=>{
            if (err){ console.log('ERROR in db.query in queryAccUsername:', err.message);
                await writeLog('ERROR in db.query in queryAccUsername:'+err.message, in_username, true);
                resolve(false)
            } else { resolve((result.rows)[0]) }
        })
    })
};

async function queryWorkDataId(in_id){
    return new Promise ((resolve, reject)=>{
        db.query( "SELECT * FROM work_data WHERE user_id = ($1)", [in_id], async (err, result)=>{
            if (err){ console.log('ERROR in db.query in queryWorkDataId:', err.message);
                await writeLog('ERROR in db.query in queryWorkDataId:'+err.message, in_id, true);
                resolve(false)
            } else{ resolve((result.rows)[0]) }
        })
    })
};

async function queryWorkDataUsername(in_username){
    return new Promise((resolve, reject)=>{
        db.query( "SELECT * FROM work_data WHERE username = ($1)", [in_username], async (err, result)=>{
            if (err){ console.log('ERROR in db.query in queryWorkDataUsername:', err.message);
                await writeLog('ERROR in db.query in queryWorkDataUsername:'+err.message, in_username, true);
                resolve(false)
            } else{ resolve((result.rows)[0]) }
        })
    })
};

async function getNewWeather(in_data_db, in_local_hour){
    const loc_data = (JSON.parse(in_data_db['loc_data']))['last'];
    const weather_str = await weatherModule(loc_data['lat'], loc_data['lon'], loc_data['tmz_iana'], in_local_hour, in_data_db['temp_celsius']);
    if(weather_str){ return weather_str }
    else { return false }
};

async function updateFromLogin(in_user_data, in_time_place_obj){
    let loc_data = JSON.parse(in_user_data['loc_data']);
    if ( !(in_time_place_obj['lat'] == -27.59 && in_time_place_obj['lon'] == -48.45) ){
        loc_data['last']['lat'] = in_time_place_obj['lat'];
        loc_data['last']['lon'] = in_time_place_obj['lon'];
        loc_data['last']['tmz_iana'] = in_time_place_obj['tmz_iana'];
        loc_data['last']['hour_offset'] = in_time_place_obj['hour_offset'];
        loc_data['last']['tmz_suffix'] = in_time_place_obj['tmz_suffix'];
        loc_data['last']['YYYY-MM-DD'] = in_time_place_obj['YYYY-MM-DD']
        const weather_str = await weatherModule(in_time_place_obj['lat'], in_time_place_obj['lon'], in_time_place_obj['tmz_iana'], in_time_place_obj['local_hour'], in_user_data['temp_celsius']);
        if(weather_str){
            await db.query("UPDATE work_data SET (last_timestamp, last_local_hour, last_UTC_hour, weather, loc_data) = ($1,$2,$3,$4,$5) WHERE user_id = ($6)",
            [
                in_time_place_obj['timestamp'], in_time_place_obj['local_hour'], in_time_place_obj['UTC_hour'], weather_str, JSON.stringify(loc_data),
                in_user_data['user_id']
            ],async (err, result) =>{
                if (err){ console.log('ERROR in db.query (A) in updateFromLogin:', err.message)
                    await writeLog('ERROR in db.query (A) in updateFromLogin:'+err.message, in_user_data['user_id'], true);
                }
            });
        }
    } else {
        const weather_str = await weatherModule(loc_data['original']['lat'], loc_data['original']['lon'], loc_data['original']['tmz_iana'], in_time_place_obj['local_hour'], in_user_data['temp_celsius']);
        if(weather_str){
            await db.query("UPDATE work_data SET (last_timestamp, last_local_hour, last_UTC_hour, weather) = ($1,$2,$3,$4) WHERE user_id = ($5)",
            [
                in_time_place_obj['timestamp'], in_time_place_obj['local_hour'], in_time_place_obj['UTC_hour'], weather_str,
                in_user_data['user_id']
            ], async (err, result) =>{
                if (err){ console.log('ERROR in db.query (B) in updateFromLogin:', err.message)
                    await writeLog('ERROR in db.query (B) in updateFromLogin:'+err.message, in_user_data['user_id'], true)
                }
            });
        }
    }
};

async function updateFromCall(in_column , JSON_str, user_id){
    if(!in_column || !JSON_str || !user_id){
        console.log('ERROR: updateFromCall requires three parameters (in_column, JSON_str, user_id)');
        await writeLog('ERROR: updateFromCall requires three parameters (in_column JSON_str user_id)',0,true)
        return false
    } else{ return new Promise ((resolve, reject)=>{
        if (in_column.length == 2){
            db.query(`UPDATE work_data SET (${in_column[0]},${in_column[1]}) = ($1,$2) WHERE user_id = $3`,
                [JSON_str[0], JSON_str[1], user_id], (err, result)=>{
                    if (err){ console.log('ERROR in updateFromCall:',err.message);
                        writeLog('ERROR in updateFromCall:'+err.message, 0, true);
                        resolve(err.message)
                    } else { resolve(true) }
                }
            )
        } else{
            db.query(`UPDATE work_data SET ${in_column} = $1 WHERE user_id = $2`,
                [JSON_str, user_id], async (err, result)=>{
                    if (err){ console.log('ERROR in updateFromCall:',err.message);
                        await writeLog('ERROR in updateFromCall:'+err.message, 0, true);
                        resolve(err.message)
                    } else { resolve(true) }
                }
            )
        }
    })}
};

async function updateProjects(in_arr_str, user_id){
    await db.query("UPDATE work_data SET projects = $1 WHERE user_id = $2",
    [in_arr_str, user_id], async (err, result)=>{
        if (err){
            console.log('ERROR while UPDATE work_data SET projects:', err.message);
            await writeLog('ERROR while UPDATE work_data SET projects:'+err.message, user_id, true);
            return false
        } else{ return true }
    })
};

function checkMultipleReq(in_obj){
    if (in_obj[0].length > 1){ return (JSON.parse(in_obj[in_obj.length-1])) };
    return JSON.parse(in_obj);
};

function newNotesStrNew(new_note_arr, user_data){
    const new_key = new_note_arr[0];
    const new_text = new_note_arr[1];
    const new_date_obj = new Date(new_key+"T00:00:00.000");
    let day_str = new_date_obj.toUTCString().slice(0,16);
    let notes = JSON.parse(user_data['notes']);
    if(notes[new_key]){ notes[new_key]['notes'].push([new_text, Date.now(), day_str]) }
    else{ notes[new_key] = {
        "weekday": new_date_obj.getUTCDay(),
        "day": new_date_obj.getUTCDate(),
        "notes": [[new_text, Date.now(), day_str]]
    }};
    return JSON.stringify(notes)
};

function newNotesStrEdit(edit_note_arr, user_data){
    const new_key = edit_note_arr[0];
    const new_text = edit_note_arr[1];
    const edit_timestamp = edit_note_arr[2];
    let notes = JSON.parse(user_data['notes']);
    let notes_key = notes[new_key]['notes'];
    for (let i = 0; i < notes_key.length; i++){
        if(notes_key[i][1] == edit_timestamp){
            notes_key[i][0] = new_text;
            break
        }
    };

    if (notes_key.length){ notes[new_key]['notes'] = notes_key }
    else{ delete notes.new_key };
    return JSON.stringify(notes)
};

function newNotesStrRm(remove_note_arr, user_data){
    const new_key = remove_note_arr[0];
    const del_timestamp = remove_note_arr[1];
    let notes = JSON.parse(user_data['notes']);
    let notes_key = notes[new_key]['notes'];
    for (let i = 0; i < notes_key.length; i++){
        if(notes_key[i][1] == del_timestamp){
            notes_key.splice(i,1);
            break 
        }
    };
    if (notes_key.length){ notes[new_key]['notes'] = notes_key }
    else{ delete notes[new_key] };
    return JSON.stringify(notes)
};

function newRtnStr(in_rtn_arr, user_data){
    const new_key = in_rtn_arr[0];
    const note_timestamp = in_rtn_arr[1];
    const note_text = in_rtn_arr[2];
    const loc_data = (JSON.parse(user_data.loc_data))['last']; 
    const new_date_obj = new Date(new_key+loc_data['tmz_suffix']);
    let rtn_key = in_rtn_arr[3];
    let routines = JSON.parse(user_data['high_wly_mly']);
    if(rtn_key[0] == "u"){
        rtn_key = rtn_key.slice(2,);
        if(rtn_key == "weekly"){
            const weekday = new_date_obj.getUTCDay();
            let buf_arr = routines['weekly'][weekday];
            for (let i = 0; i < buf_arr.length; i++){
                if(buf_arr[i] == note_text){ buf_arr.splice(i,1); break }
            };
            if (buf_arr.length){ routines['weekly'][weekday] = buf_arr }
            else { delete (routines['weekly'])[weekday] }
        } else if(rtn_key == "monthly"){
            const day = new_date_obj.getUTCDate();
            let buf_arr = routines['monthly'][day];
            for (let i = 0; i < buf_arr.length; i++){
                if(buf_arr[i] == note_text){ buf_arr.splice(i,1); break }
            };
            if (buf_arr.length){ routines['monthly'][day] = buf_arr }
            else { delete (routines['monthly'])[day] }
        } else{
            let buf_arr = routines['highlight'][new_key];
            for (let i = 0; i < buf_arr.length; i++){
                if(buf_arr[i][1] == note_timestamp){ buf_arr.splice(i,1); break }
            };
            if (buf_arr.length){ routines['highlight'][new_key] = buf_arr }
            else { delete (routines['highlight'])[new_key] }
        }
    } else {
        if (!routines[rtn_key]){ routines[rtn_key] = {} };
        if(rtn_key == "weekly"){
            try{ routines['weekly'][new_date_obj.getUTCDay()].push(note_text) }
            catch{ routines['weekly'][new_date_obj.getUTCDay()] = [note_text] }
        } else if(rtn_key == "monthly"){
            try{ routines['monthly'][new_date_obj.getUTCDate()].push(note_text) }
            catch{ routines['monthly'][new_date_obj.getUTCDate()] = [note_text] }
        } else{
            try{ routines['highlight'][new_key].push([note_text, note_timestamp]) }
            catch{ routines['highlight'][new_key] = [[note_text, note_timestamp]] }
        }
    };
    return JSON.stringify(routines)
};

function newNotesStrEditRtn(in_arr, user_data){
    const new_key = in_arr[0];
    const new_text = in_arr[1];
    const edit_timestamp = in_arr[3];
    let notes = JSON.parse(user_data['notes']);
    let notes_key = notes[new_key]['notes'];
    for (let i = 0; i < notes_key.length; i++){
        if(notes_key[i][1] == edit_timestamp){
            notes_key[i][0] = new_text;
            break
        }
    };
    let routines = JSON.parse(user_data['high_wly_mly']);
    if (in_arr[4] == "weekly" || in_arr[4] == "bothstamps"){
        let weekday = new Date(new_key+"T00:00:00.000").getUTCDay();
        let this_length = routines['weekly'][weekday].length;
        if (this_length == 1){ routines['weekly'][weekday][0] = new_text }
        else{
            for (let a = 0; a < this_length; a++){
                if (routines['weekly'][weekday][a] == in_arr[2]){
                    routines['weekly'][weekday][a] = new_text;
                    break
                }
            }
        }
    } else if (in_arr[4] == "monthly" || in_arr[4] == "bothstamps"){
        let day = new Date(new_key+"T00:00:00.000").getUTCDate();
        let this_length = routines['monthly'][day].length;
        if (this_length == 1){ routines['monthly'][day][0] = new_text }
        else{
            for (let a = 0; a < this_length; a++){
                if (routines['monthly'][day][a] == in_arr[2]){
                    routines['monthly'][day][a] = new_text;
                    break
                }
            }
        }
    };
    return [JSON.stringify(notes), JSON.stringify(routines)]
};

function addToDaysArrFromRoutines(in_arr, value, buf_date, date_str){
    let buf_arr = in_arr;
    for (let v = 0; v < value.length; v++){
        let already_there = false;
        for (let b = 0; b < buf_arr.length; b++){
            if(value[v] == buf_arr[b][0]){
                let buf_added = buf_arr[b];
                already_there = true;
                if(buf_added[1].length == 2){
                    if(new Date(buf_added[1][1]).getTime() > buf_date.getTime()){
                        buf_added[1][1] = date_str;
                        buf_added[1].push('...')
                    } else{
                        buf_added[1].push('...')
                    }
                } else if (buf_added[1].length == 1 && buf_added[1][0] != date_str){
                    if(new Date(buf_added[1][0]).getTime() < buf_date.getTime()){
                        buf_added[1].push(date_str)
                    } else if(new Date(buf_added[1][0]).getTime() > buf_date.getTime()){
                        buf_added[1].unshift(date_str)
                    }
                };
                buf_arr[b] = buf_added;
                break
            }
        };
        if (!already_there){
            if(buf_arr.length){
                for (let b = 0; b < buf_arr.length; b++){
                    if (new Date(buf_arr[b][1][0]).getTime() <= buf_date.getTime()){
                        if (!buf_arr[b+1]){
                            buf_arr.push([value[v],[date_str]]);
                            break
                        }
                    } else if (new Date(buf_arr[b][1][0]).getTime() > buf_date.getTime()){
                        buf_arr.splice(b,0,[value[v],[date_str]]);
                        break
                    }
                }
            } else{ buf_arr.push([value[v],[date_str]]) }
        }
    };
    return buf_arr
};

function handleWeekly(weekly, now_timestamp, days_7, days_31, in_hour){
    let buffer7 = days_7;
    let buffer31 = days_31;
    let buf_date, date_str, beginning, end, buf_timestamp;
    if (in_hour < 17 && in_hour > 3){
        beginning = 2; end = 9
    } else{
        beginning = 3; end = 10
    };
    Object.entries(weekly).forEach(([key, value]) => {
        for (let d = beginning; d < end; d+= 1){
            for (let k = 0; k < 4; k++){                            // iterate 1~4 weeks
                buf_date = new Date (now_timestamp + ((d*86400000)+(k*604800000)));
                buf_timestamp = buf_date.getTime();
                plus32 = now_timestamp + 2764800000;
                plus2 = now_timestamp + 172800000;
                if (buf_date.getUTCDay() == key && buf_timestamp < plus32 && buf_timestamp > plus2){
                    date_str = buf_date.toUTCString().slice(0,16);
                    if (d < 8){
                        if(!k){                                     // goes to days_7
                            buffer7 = addToDaysArrFromRoutines(buffer7, value, buf_date, date_str)
                        } else{                                     // goes to days_31
                            buffer31 = addToDaysArrFromRoutines(buffer31, value, buf_date, date_str)
                        }                                    
                    } else{                                             // goes to days_31
                        buffer31 = addToDaysArrFromRoutines(days_31, value, buf_date, date_str)
                    }
                } else{ break }
            }
        }
    });
    return [buffer7, buffer31]
};

function handleMonthly(monthly, today_timestamp, days_7, days_31, user_yyyymmdd, in_hour){
    let buffer7 = days_7;
    let buffer31 = days_31;
    const orig_year_str = user_yyyymmdd.slice(0,4);    //0123-56-89
    const orig_month_str = user_yyyymmdd.slice(5,7);
    Object.entries(monthly).forEach(([key, value]) => {
        let buf_day, buf_date, buf_timestamp, date_str, margin;
        if (key < 10){ buf_day = "0"+key.toString() }
        else{ buf_day = key.toString() };
        buf_date = new Date(orig_year_str+'-'+orig_month_str+'-'+buf_day+"T00:00:00.000");
        buf_timestamp = buf_date.getTime();
        if (in_hour < 17 && in_hour > 3){ margin = 172800000 }
        else{ margin = 259200000 };
        if (buf_timestamp < today_timestamp + margin){
            buf_timestamp = buf_date.getTime() + 2678400000;            // +31d
            buf_date = new Date(buf_timestamp);
            let current_day = buf_date.getUTCDate();
            let k = 1;
            while(current_day != key){
                buf_date = new Date(buf_timestamp - (k * 86400000));
                current_day = buf_date.getUTCDate();
                k += 1
            };
            buf_timestamp = buf_date.getTime();
        };
        if (buf_timestamp <= today_timestamp + 2764800000){           // < 32 this is what we are looking for
            date_str = buf_date.toUTCString().slice(0,16);
            if (buf_timestamp < today_timestamp + 691200000){             // < 8
                buffer7 = addToDaysArrFromRoutines(buffer7, value, buf_date, date_str)
            } else{
                buffer31 = addToDaysArrFromRoutines(buffer31, value, buf_date, date_str)
            }
        }
    });
    return [buffer7, buffer31]
};

function addToDaysArrFromNotes(in_arr, day_notes, buf_date, date_str){
    let buf_arr = in_arr;
    for (let n = 0; n < day_notes.length; n++){
        let already_there = false;
        if (buf_arr.length){
            for (let d = 0; d < buf_arr.length; d++){
                if(day_notes[n][0] == buf_arr[d][0]){
                    let buf_added = buf_arr[d];
                    already_there = true;
                    if (buf_added[1].length == 2){
                        if(new Date(buf_added[1][1]).getTime() > buf_date.getTime()){
                            buf_added[1][1] = date_str;
                            buf_added[1].push('...')
                        } else{
                            buf_added[1].push('...')
                        }
                    } else if (buf_added[1].length == 1 && buf_added[1][0] != date_str){
                        if (new Date(buf_added[1][0]).getTime() < buf_date.getTime() ){
                            buf_added[1].push(date_str)
                        } else if (new Date(buf_added[1][0]).getTime() > buf_date.getTime() ){
                            buf_added[1].unshift(date_str)
                        }
                    };
                    buf_arr[d] = buf_added;
                    break
                }
            };
            if (!already_there){
                if (buf_arr.length){
                    for (let b = 0; b < buf_arr.length; b++){
                        if (new Date(buf_arr[b][1][0]).getTime() <= buf_date.getTime()){
                            if (!buf_arr[b+1]){
                                buf_arr.push([day_notes[n][0],[date_str]]);
                                break
                            }
                        } else {
                            buf_arr.splice(b,0,[day_notes[n][0],[date_str]]);
                            break
                        }
                    }
                } else{
                    buf_arr.push([day_notes[n][0],[date_str]]);
                }
            }
        } else{
            buf_arr.push([day_notes[n][0],[date_str]]);
        }
    };
    return buf_arr
};

function iterate31days(in_notes, today_timestamp, in_hour){
    let buf_7 = [];
    let buf_31 = [];
    let buf_date, day_notes, date_str, margin;
    Object.entries(in_notes).forEach(([key, value]) => {
        buf_date = new Date(key+"T00:00:00.000");
        day_notes = value['notes'];
        if (in_hour < 17 && in_hour > 3){ margin = 172800000 }
        else{ margin = 259200000 };
        if (buf_date.getTime() <= today_timestamp + margin){}    // in the past or today or tomorrow
        else if (buf_date.getTime() <= today_timestamp + 2764800000){           // < 32
            date_str = buf_date.toUTCString().slice(0,16);
            if (buf_date.getTime() < today_timestamp + 691200000){             // < 8
                buf_7 = addToDaysArrFromNotes(buf_7, day_notes, buf_date, date_str)
            } else{
                buf_31 = addToDaysArrFromNotes(buf_31, day_notes, buf_date, date_str)
            }
        }
    });
    return[buf_7,buf_31]
};

function manageReturn(ft, in_key, user_hour, username){
    if (ft == true){    // <-- leave it like that
        if (user_hour < 17 && user_hour > 3){
            return `/home/${username}?new_y=${in_key.slice(0,4)}&new_m=${parseInt(in_key.slice(5,7))-1}&new_d=${parseInt(in_key.slice(8,))}`
        } else{
            return `/home/${username}?new_y=${in_key.slice(0,4)}&new_m=${parseInt(in_key.slice(5,7))-1}&new_d=${parseInt(in_key.slice(8,))-1}`
        }
    } else { return `/home/${username}` }
};

async function handleWeatherChange(temp_letter, user_id){
    let new_value = temp_letter[1];
    return new Promise((resolve, reject)=>{
        if (new_value == "o" || new_value == "s"){
            if (new_value == "o")    { new_value = false }
            else                    { new_value = true }
            db.query("UPDATE work_data SET wtr_simple = $1 WHERE user_id = $2",
            [new_value, user_id], async (err,result)=>{
                if (err){
                    console.log('ERROR while UPDATE work_data SET wtr_simple:', err.message);
                    await writeLog('ERROR while UPDATE work_data SET wtr_simple:'+err.message, user_id, true);
                    resolve(false)
                } else{resolve(true)}
            })
        } else{
            if (new_value == 0 || new_value == "0") { new_value = false }
            else                                    { new_value = true }
            db.query("SELECT weather FROM work_data WHERE user_id = $1", [user_id], async (err, result)=>{
                if (err){
                    console.log('ERROR while SELECT weather FROM work_data:', err.message);
                    await writeLog('ERROR while SELECT weather FROM work_data:'+err.message, user_id, true);
                    resolve(false)
                } else{
                    let this_weather = JSON.parse((result.rows[0]['weather']));
                    if (new_value){
                        Object.entries(this_weather).forEach(([key, value]) => {
                            let tmp_values = value['hr_tmp_code'];
                            let this_temp;
                            for (let i = 0; i < tmp_values.length; i++){
                                this_temp = tmp_values[i][1];
                                this_temp = Math.round((this_temp-32)*(0.55556));
                                tmp_values[i][1] = this_temp
                            };
                            value['hr_tmp_code'] = tmp_values
                            value['max'][1] = Math.round((value['max'][1]-32)*(0.55556));
                            value['min'][1] = Math.round((value['min'][1]-32)*(0.55556));
                        })
                    } else{
                        Object.entries(this_weather).forEach(([key, value]) => {
                            let tmp_values = value['hr_tmp_code'];
                            let this_temp;
                            for (let i = 0; i < tmp_values.length; i++){
                                this_temp = tmp_values[i][1];
                                this_temp = Math.round((this_temp*1.8)+32);
                                tmp_values[i][1] = this_temp
                            };
                            value['hr_tmp_code'] = tmp_values;
                            value['max'][1] = Math.round((value['max'][1]*1.8)+32)
                            value['min'][1] = Math.round((value['min'][1]*1.8)+32)
                        })
                    };
                    db.query("UPDATE work_data SET (weather, temp_celsius) = ($1,$2) WHERE user_id = $3",
                    [JSON.stringify(this_weather), new_value, user_id], async (err,result)=>{
                        if (err){
                            console.log('ERROR while UPDATE work_data SET (weather, temp_celsius):', err.message);
                            await writeLog('ERROR while UPDATE work_data SET (weather, temp_celsius):'+err.message, user_id, true);
                            resolve(false)
                        } else{ resolve(true) }
                    })
                }
            })
        }
    })
};

async function newProjectTitle(req_body, projects){
    let buf_proj = {
        "title":req_body.new_project_title,
        "final_deadline":req_body.new_project_deadline,
        "tasks_todo":[],    
        "tasks_done":[]
    };
    let task_str = "new_project_task";
    let deadline_str = "new_task_deadline";
    let last_added = 0;
    for (let a = 0; a < 8; a++){
        let new_task = task_str+(a.toString());
        let new_deadline = deadline_str+(a.toString());
        if (req_body[new_task]){
            if (req_body[new_deadline]){
                buf_proj['tasks_todo'].push({"task":req_body[new_task],"obs":"","deadline":req_body[new_deadline]})
            }else{
                buf_proj['tasks_todo'].push({"task":req_body[new_task],"obs":"","deadline":false})
            };
            last_added += 1
        }
    };
    projects.push(buf_proj);
    return JSON.stringify(projects)
};

async function projectTaskArr(req_body, projects){
    const proj_arr = JSON.parse(req_body.project_task_arr);
    const proj_index =  proj_arr[0];
    const old_text =    proj_arr[1];
    const status =      proj_arr[2];
    const new_text =    proj_arr[3];
    const task_before = proj_arr[4];
    const task_after =  proj_arr[5];
    const task_ddl =    proj_arr[6];
    if (new_text.length){
        let buf_tasks = projects[proj_index]["tasks_"+status];
        for (let a = 0; a < buf_tasks.length; a++){
            if (buf_tasks[a]["task"] == old_text){ buf_tasks[a]["task"] = new_text; break }
        };
        projects[proj_index]["tasks_"+status] = buf_tasks;
    };
    if (task_before.length){
        let buf_tasks = projects[proj_index]["tasks_"+status];
        for (let a = 0; a < buf_tasks.length; a++){
            if (buf_tasks[a]["task"] == old_text){
                buf_tasks.splice(a,0,{"task":task_before,"obs":"","deadline":false});
                break
            }
        };
        projects[proj_index]["tasks_"+status] = buf_tasks;
    };
    if (task_after.length){
        let buf_tasks = projects[proj_index]["tasks_"+status];
        for (let a = 0; a < buf_tasks.length; a++){
            if (buf_tasks[a]["task"] == old_text){
                if(buf_tasks[a+1]){
                    buf_tasks.splice(a+1,0,{"task":task_after,"obs":"","deadline":false})
                } else{
                    buf_tasks.push({"task":task_after,"obs":"","deadline":false})
                };
                break
            }
        };
        projects[proj_index]["tasks_"+status] = buf_tasks;
    };
    if (task_ddl.length){
        let buf_tasks = projects[proj_index]["tasks_"+status];
        let removed_task;
        for (let a = 0; a < buf_tasks.length; a++){
            if (buf_tasks[a]["task"] == old_text){
                if (buf_tasks.length == 1){
                    buf_tasks[a]["deadline"] = task_ddl;
                    break
                } else{
                    removed_task = buf_tasks[a];
                    buf_tasks.splice(a,1);
                    break
                }
            }
        };
        removed_task['deadline'] = task_ddl;
        if (removed_task){
            for (let a = 0; a < buf_tasks.length; a++){
                if(new Date(buf_tasks[a]["deadline"]).getTime() > new Date(removed_task["deadline"]).getTime()){
                    buf_tasks.splice(a,0,removed_task);
                    break
                } else if (!buf_tasks[a+1]){
                    if (buf_tasks[a]["deadline"] == false || buf_tasks[a]["deadline"] == "false"){
                        buf_tasks.splice(a,0,removed_task)
                    } else{ buf_tasks.push(removed_task) }
                    break
                }
            }
        };
        projects[proj_index]["tasks_"+status] = buf_tasks;
    };
    return JSON.stringify(projects)
};

async function markDoneTodo(req_body, projects){
    const proj_arr = JSON.parse(req_body.mark_done_todo);
    const proj_index =  proj_arr[0];
    const text =        proj_arr[1];
    const status =      proj_arr[2];
    let buf_tasks = projects[proj_index]["tasks_"+status];
    let removed_task;
    for (let a = 0; a < buf_tasks.length; a++){
        if (buf_tasks[a]["task"] == text){
            removed_task = buf_tasks[a]
            buf_tasks.splice(a,1);
            break
        }
    };
    projects[proj_index]["tasks_"+status] = buf_tasks;
    if (status == "todo"){
        projects[proj_index]["tasks_done"].push(removed_task)
    } else{
        if (removed_task["deadline"] == false || removed_task["deadline"] == "false" || !projects[proj_index]["tasks_todo"].length){
            projects[proj_index]["tasks_todo"].push(removed_task)
        } else{
            buf_tasks = projects[proj_index]["tasks_todo"];
            for (let a = 0; a < buf_tasks.length; a++){
                if(new Date(buf_tasks[a]["deadline"]).getTime() > new Date(removed_task["deadline"]).getTime()){
                    buf_tasks.splice(a,0,removed_task);
                    break
                } else if (!buf_tasks[a+1]){
                    if (buf_tasks[a]["deadline"] == false || buf_tasks[a]["deadline"] == "false"){
                        buf_tasks.splice(a,0,removed_task)
                    } else{ buf_tasks.push(removed_task) }
                    break
                }
            }
            projects[proj_index]["tasks_todo"] = buf_tasks
        }
    };
    return JSON.stringify(projects)
};

async function projectTitleAndDeadlineArr(req_body, projects){
    const proj_arr = JSON.parse(req_body.project_title_and_deadline_arr);
    const proj_index =  proj_arr[0];
    const new_ddl =     proj_arr[1];
    const new_title =   proj_arr[2];
    if (new_ddl.length){ projects[proj_index]["final_deadline"] = new_ddl };
    if (new_title.length){ projects[proj_index]["title"] = new_title };
    return JSON.stringify(projects);
};

async function editObsArr(req_body, projects){
    const proj_arr = JSON.parse(req_body.edit_obs_arr);
    const proj_index =  proj_arr[0];
    const task_text =   proj_arr[1];
    const status =      proj_arr[2];
    const obs_text =    proj_arr[3];
    let buf_tasks = projects[proj_index]["tasks_"+status];
    for (let a = 0; a < buf_tasks.length; a++){
        if (buf_tasks[a]["task"] == task_text){
            buf_tasks[a]["obs"] = obs_text;
            break
        }
    };
    projects[proj_index]["tasks_"+status] = buf_tasks;
    return JSON.stringify(projects)
};

async function removeTaskArr(req_body, projects){
    const proj_arr = JSON.parse(req_body.remove_task_arr);
    const proj_index =  proj_arr[0];
    const text =        proj_arr[1];
    const status =      proj_arr[2];
    let buf_tasks = projects[proj_index]["tasks_"+status];
    for (let a = 0; a < buf_tasks.length; a++){
        if (buf_tasks[a]["task"] == text){
            buf_tasks.splice(a,1);
            break
        }
    };
    projects[proj_index]["tasks_"+status] = buf_tasks;        
    return JSON.stringify(projects)
};

async function callVerifyPassword(in_pw, user_id){
    let this_user;
    return new Promise((resolve, reject)=>{
        checker = db.query('SELECT * FROM credential WHERE id = ($1)', [user_id], async function (err,user){
            if (err) { console.log('ERROR in db.query in callVerifyPassword:', err.message);
                await writeLog('ERROR in db.query in callVerifyPassword:'+err.message, user_id, true);
                resolve(false)
            } else {
                try{ this_user = user.rows[0] }
                catch (err){ console.log('ERROR catched in callVerifyPassword: try{ user = user.rows[0]:', err.message);
                    await writeLog('ERROR catched in callVerifyPassword: try{ user = user.rows[0]:'+err.message, user_id, true);
                    resolve(false)
                };
                if (!user) { console.log('callVerifyPassword: db.query returned no user');
                    resolve(false)
                };
                let result = await verifyPassword( (in_pw + (process.env.PEP)), this_user['password'] );
                if (result) { resolve(true) }
                else{ console.log('callVerifyPassword --> verifyPassword returned false, returning false');
                    resolve(false)
                }
            }
        });
    })
};

async function changePersonalInfo(in_arr, user_id){
    //[first_name, surname, email, phone, lang, $("#new_pw").val(), $("#acc_curr_pw").val()]
    if (in_arr[5].length){
        let this_1;
        await db.query("SELECT password FROM credential WHERE id = $1",[user_id], async (err1, result)=>{
            if (err1){
                console.log('ERROR while SELECT password FROM credential in changePersonalInfo:', err1.message);
                await writeLog('ERROR while SELECT password FROM credential in changePersonalInfo:'+err1.message, user_id, true);
                return false
            } else{ this_1 = result.rows[0].password };
            bcrypt.hash( ( (in_arr[5])+(process.env.PEP) ), saltRounds, async function(err2, hash) {
                if(err2){
                    console.log('ERROR in bcrypt.hash in changePersonalInfo:', err2.message);
                    await writeLog('ERROR in bcrypt.hash in changePersonalInfo:'+err2.message, user_id, true);
                    return false
                } else {
                    await db.query("UPDATE credential SET password = $1 WHERE id = $2",
                    [hash, user_id], async (err3,result)=>{
                        if (err3){
                            console.log("ERROR while UPDATE credential SET password = $1 in changePersonalInfo():", err3.message);
                            await writeLog("ERROR while UPDATE credential SET password = $1 in changePersonalInfo():"+err3.message, user_id,true);
                            return false
                        } else{
                            if (in_arr[5].length){  //lang
                                await db.query("UPDATE work_data SET (first_name, surname, email, phone, lang, pw_last_change, prev_pw) = ($1,$2,$3,$4,$5,$6,$7) WHERE user_id = ($8)",
                                [in_arr[0], in_arr[1], in_arr[2], in_arr[3], in_arr[4], Date.now(), this_1, user_id], async (err4, result)=>{
                                    if (err4){
                                        console.log('ERROR while UPDATE account in changePersonalInfo:', err4.message);
                                        await writeLog('ERROR while UPDATE account in changePersonalInfo:'+err4.message, user_id, true);
                                        return false
                                    } else{ return true }
                                })
                            } else{
                                await db.query("UPDATE work_data SET (first_name, surname, email, phone, pw_last_change, prev_pw) = ($1,$2,$3,$4,$5,$6) WHERE user_id = ($7)",
                                [in_arr[0], in_arr[1], in_arr[2], in_arr[3], Date.now(), this_1, user_id], async (err4, result)=>{
                                    if (err4){
                                        console.log('ERROR while UPDATE account in changePersonalInfo:', err4.message);
                                        await writeLog('ERROR while UPDATE account in changePersonalInfo:'+err4.message, user_id, true);
                                        return false
                                    } else{ return true }
                                })
                            }
                        }
                    })                    
                }
            })
        })
    } else{
        if (in_arr[5].length){  //lang
            await db.query("UPDATE work_data SET (first_name, surname, email, phone, lang) = ($1,$2,$3,$4,$5) WHERE user_id = ($6)",
            [in_arr[0], in_arr[1], in_arr[2], in_arr[3], in_arr[4], user_id], async (err4, result)=>{
                if (err4){
                    console.log('ERROR while UPDATE account in changePersonalInfo:', err4.message);
                    await writeLog('ERROR while UPDATE account in changePersonalInfo:'+err4.message, user_id, true);
                    return false
                } else{ return true }
            })
        } else{
            await db.query("UPDATE work_data SET (first_name, surname, email, phone) = ($1,$2,$3,$4) WHERE user_id = ($5)",
            [in_arr[0], in_arr[1], in_arr[2], in_arr[3], user_id], async (err4, result)=>{
                if (err4){
                    console.log('ERROR while UPDATE account in changePersonalInfo:', err4.message);
                    await writeLog('ERROR while UPDATE account in changePersonalInfo:'+err4.message, user_id, true);
                    return false
                } else{ return true }
            })
        }
    }
};

//////////////////////////////////    ROUTES    //////////////////////////////////
//////////////////////////////////    ROUTES    //////////////////////////////////
//////////////////////////////////    ROUTES    //////////////////////////////////

app.get('/', (req, res) => {
    res.redirect('/login')
});

app.get('/home', async (req, res) => {        //http://localhost:3000/home?new_y=2023&new_m=11&new_d=6
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>> GET /home');
    console.log(req.rawHeaders); console.log(req.sessionID); console.log(req.session); console.log(req.user);
    if(req.session && req.user){
        if (req.user.password != 'google_oauth'){
            await db.query("SELECT expire FROM session WHERE sid = ($1)",[req.sessionID],
            (err, result)=>{
                if (err){ return res.redirect('/login') }
                else if(result.rows.length){
                    if( new Date(result.rows[0].expire) < Date.now() ){ return res.redirect('/login') }
                    else{
                        try{ return res.redirect(`/home/${req.user.username}`) }
                        catch{ return res.redirect('/login') }
                    }
                } else{ return res.redirect('/login') }
            })
        } else{ return res.redirect(`/home/${req.user.username}`) }
    } else { res.redirect('/login') }
});

app.get('/login', (req, res) => {
    res.render('login', {})
});

app.get('/home/:username', async (req, res) => {
    console.log('GET /home/:username');
    try{
        console.log(req.session); console.log(req.sessionID); console.log(req.user); console.log(req.body);
    } catch(err){
        console.log(err.message)
    };
    if (req.params.username == "undefined"){ return res.redirect('/login') };
    if(req.isAuthenticated()){
        await db.query('SELECT * FROM session WHERE sid = ($1)',[req.sessionID], async (err,result)=>{
            if (err){ console.log('ERROR in db.query in GET /home/:username:', err.message);
                await writeLog('ERROR in db.query in GET /home/:username:'+err.message, req.params.username, true);
                return res.redirect('/login')
            } else if(result.rows.length){
                const user_id = result.rows[0].sess.passport.user;
                const user_data = await queryWorkDataId(user_id);
                if (!user_data){ return res.redirect('/login') };
                const username = user_data['username'];
                if (req.params.username != username){
                    writeLog('req.params.username is '+req.params.username+' but username from db is '+username, 0, false);
                    return res.redirect('/login')
                };

                const new_date =    new Date();
                const now_timestamp = new_date.getTime();
                const notes =       JSON.parse(user_data['notes']);
                const routines =    JSON.parse(user_data['high_wly_mly']);
                const projects =    user_data['projects'];
                const weather =     user_data['weather'];
                const loc_data =    (JSON.parse(user_data.loc_data))['last'];
                const weekly =      routines['weekly'];
                const monthly =     routines['monthly'];
                const user_yyyymmdd = loc_data['YYYY-MM-DD'];
                const today_timestamp = new Date(user_yyyymmdd+"T00:00:00.000").getTime();
                let buffer_arrays;
    
                buffer_arrays = iterate31days(notes, today_timestamp, user_data['last_local_hour']);
                let days_7 = buffer_arrays[0];
                let days_31 = buffer_arrays[1];
    
                if(weekly && weekly != {}){
                    buffer_arrays = handleWeekly(weekly, today_timestamp, days_7, days_31, user_data['last_local_hour']);
                    days_7 = buffer_arrays[0];
                    days_31 = buffer_arrays[1];
                };
                if(monthly && monthly != {}){
                    buffer_arrays = handleMonthly(monthly, today_timestamp, days_7, days_31, user_yyyymmdd, user_data['last_local_hour']);
                    days_7 = buffer_arrays[0];
                    days_31 = buffer_arrays[1];
                };
                
                let dayA_obj, dayA_key, dayB_obj, dayB_key, dayC_obj, dayC_key, A_notes, B_notes, C_notes, new_date_q, new_timestamp, mili_diff, dayA_wtr, dayB_wtr, dayC_wtr;
                if(req.query.new_y){
                    let q_m = (parseInt(req.query.new_m)+1).toString(); if (q_m.length == 1){ q_m = "0"+q_m };
                    let q_d = req.query.new_d; if (q_d.length == 1){ q_d = "0"+q_d };
                    const key_str = req.query.new_y + '-' + q_m + '-' + q_d;
                    if( loc_data['YYYY-MM-DD'] != key_str ){
                        new_date_q = new Date(key_str + loc_data['tmz_suffix']);
                        new_timestamp = new_date_q.getTime();
                        mili_diff = new_timestamp - now_timestamp;
                        dayA_obj = dayModule.dayA(loc_data['tmz_iana'], new_timestamp); dayA_key = dayA_obj['YYYY-MM-DD'];
                        dayB_obj = dayModule.dayB(loc_data['tmz_iana'], new_timestamp); dayB_key = dayB_obj['YYYY-MM-DD'];
                        dayC_obj = dayModule.dayC(loc_data['tmz_iana'], new_timestamp); dayC_key = dayC_obj['YYYY-MM-DD']
                    } else{
                        dayA_obj = dayModule.dayA(loc_data['tmz_iana']); dayA_key = dayA_obj['YYYY-MM-DD'];
                        dayB_obj = dayModule.dayB(loc_data['tmz_iana']); dayB_key = dayB_obj['YYYY-MM-DD'];
                        dayC_obj = dayModule.dayC(loc_data['tmz_iana']); dayC_key = dayC_obj['YYYY-MM-DD'];
                        mili_diff = 1
                    }
                } else {
                    dayA_obj = dayModule.dayA(loc_data['tmz_iana']); dayA_key = dayA_obj['YYYY-MM-DD'];
                    dayB_obj = dayModule.dayB(loc_data['tmz_iana']); dayB_key = dayB_obj['YYYY-MM-DD'];
                    dayC_obj = dayModule.dayC(loc_data['tmz_iana']); dayC_key = dayC_obj['YYYY-MM-DD'];
                    mili_diff = 1
                };
                if(!new_timestamp){ new_timestamp = now_timestamp };
    
                const empty_arr_str = JSON.stringify([]);
                try{ A_notes = JSON.stringify(notes[dayA_key]['notes']) }
                catch{ A_notes = empty_arr_str };
                try{ B_notes = JSON.stringify(notes[dayB_key]['notes']) }
                catch{ B_notes = empty_arr_str };
                try{ C_notes = JSON.stringify(notes[dayC_key]['notes']) }
                catch{ C_notes = empty_arr_str };
                
                const local_hour = new_date.getUTCHours()-(parseInt(loc_data['hour_offset']))
                const prot_date = new Date(now_timestamp + (parseInt(loc_data['hour_offset']) * 3600000));
                const YYYY = prot_date.getUTCFullYear();
                let MM = prot_date.getUTCMonth()+1;
                let DD = prot_date.getUTCDate();
                if (MM < 10){ MM = '0'+MM.toString() } else{ MM = MM.toString() };
                if (DD < 10){ DD = '0'+DD.toString() } else{ DD = DD.toString() };
                const local_YYYYMMDD = YYYY+'-'+MM+'-'+DD;

                res.render('index', {
                    tmz_suffix_PH : loc_data['tmz_suffix'], local_hour_PH: local_hour, 
                    dayA_PH: dayModule.dayA_pretty(new_timestamp), notesDayA_PH_string: A_notes, dayA_hidden_date_PH : dayA_key,
                    dayB_PH: dayModule.dayB_pretty(new_timestamp), notesDayB_PH_string: B_notes, dayB_hidden_date_PH : dayB_key,
                    dayC_PH: dayModule.dayC_pretty(new_timestamp), notesDayC_PH_string: C_notes, dayC_hidden_date_PH : dayC_key,
                    routines_raw_PH_string: user_data['high_wly_mly'], first_name_PH: user_data['first_name'],
                    mili_diff_PH: mili_diff, projects_PH_str: user_data['projects'], username_PH: username,
                    days_7_PH : JSON.stringify(days_7) , days_31_PH : JSON.stringify(days_31), weather_PH: weather,
                    wtr_simple_PH: user_data['wtr_simple'], celsius_PH: user_data['temp_celsius'],
                    surname_PH: user_data['surname'], useremail_PH: user_data['email'], userphone_PH: user_data['phone'],
                    user_lang_PH: user_data['lang'], today_YYYYMMDD_PH: local_YYYYMMDD, hour_offset_PH: loc_data['hour_offset']
                })
            } else { console.log('NO COOKIE'); return res.redirect('/login') }
        })
    } else{ console.log('NOT AUTHENTICATED'); return res.redirect('/login') }
});

app.get('/login_google', passport.authenticate('google'));
app.get('/oauth_google',
    passport.authenticate('google', { failureRedirect: '/user_unavailable', failureMessage: true }),
    function(req, res) { res.redirect('/home') }
);

app.get('/demonstration', function (req,res){
    res.render('demo2', { demo_username_PH: demo_username})
});

app.post('/demo2',
    passport.authenticate('local', { failureRedirect: '/registration_failed' }),
    function(req, res) {
        res.redirect(`/home/${demo_username}`)
    }
);

app.post('/home', async function (req,res){
    console.log('POST /home/:username');
    console.log(req.body);
    if (req.isAuthenticated()){
        if(req.body.logout){                                    // logout from home page
            req.session.destroy();
            return res.redirect('/login')
        };
    
        const username = req.user.username;
        const user_id = req.user.id;
        const user_data = await queryWorkDataId(user_id);
        let user_hour, user_hour_timestamp, new_weather;

        if (req.body.user_hour_timestamp){
            user_hour_timestamp = checkMultipleReq(req.body.user_hour_timestamp);
            user_hour = user_hour_timestamp[0];
            const UTC_hour = user_hour_timestamp[1];
            const user_timestamp = user_hour_timestamp[2];
            if ((user_timestamp > (user_data['last_timestamp']+3600000)) ||
                (user_hour != user_data['last_local_hour'])){
                new_weather = await getNewWeather(user_data, user_hour, UTC_hour, user_timestamp)
            } else { new_weather = false }
        };
        
        async function waitForWeatherUpdate(in_itv, in_str, in_column){
            if (new_weather == undefined){
                if (in_itv && in_itv > 40){
                    return(await updateFromCall(in_column, in_str, user_id))
                } else{ setTimeout(() => { return waitForWeatherUpdate(in_itv+1, in_str, in_column) }, 50) }
            } else if (new_weather){ return(await updateFromCall(['weather', in_column], [new_weather, in_str], user_id)) }
            else{ return(await updateFromCall(in_column, in_str, user_id)) }
        };

        if(req.body.new_note_arr){
            const this_arr = checkMultipleReq(req.body.new_note_arr);
            const new_str = newNotesStrNew(this_arr, user_data);
            await waitForWeatherUpdate(0, new_str, 'notes');
            return res.redirect(manageReturn(this_arr[2], this_arr[3], user_hour, username))
        };
    
        if(req.body.edit_note_arr){ console.log('entered edit_note route');
            const this_arr = checkMultipleReq(req.body.edit_note_arr);
            console.log('this_arr is:', this_arr);
            const new_str = newNotesStrEdit(this_arr, user_data);
            console.log('new_str is:', new_str);
            await waitForWeatherUpdate(0, new_str, 'notes');
            return res.redirect(manageReturn(this_arr[3], this_arr[4], user_hour, username))
        };
    
        if(req.body.remove_note_arr){
            const this_arr = checkMultipleReq(req.body.remove_note_arr);
            const new_str = newNotesStrRm(this_arr, user_data);
            await waitForWeatherUpdate(0, new_str, 'notes');
            return res.redirect(manageReturn(this_arr[2], this_arr[3], user_hour, username))
        };
    
        if(req.body.routine_note_arr){
            const this_arr = checkMultipleReq(req.body.routine_note_arr);
            const new_str = newRtnStr(this_arr, user_data);
            await waitForWeatherUpdate(0, new_str, 'high_wly_mly');
            return res.redirect(manageReturn(this_arr[4], this_arr[5], user_hour, username))
        };
    
        if(req.body.edit_routine_note){
            const this_arr = checkMultipleReq(req.body.edit_routine_note);
            const new_str_arr = newNotesStrEditRtn(this_arr, user_data);
            await waitForWeatherUpdate(0, new_str_arr, ['notes', 'high_wly_mly']);
            return res.redirect(manageReturn(this_arr[5], this_arr[6], user_hour, username))
        };
    
        if(req.body.temp_letter){
            const temp_letter = checkMultipleReq(req.body.temp_letter);
            await handleWeatherChange(temp_letter, user_id);
            return res.redirect(`/home/${username}`)
        };

        //////////////////////////// PROJECTS

        if (req.body.new_project_title){
            const result = await newProjectTitle(req.body, JSON.parse(user_data['projects']));
            if (result){ await waitForWeatherUpdate(0, result, 'projects') };
            return res.redirect(`/home/${username}`)
        };
    
        if(req.body.project_task_arr){
            const result = await projectTaskArr(req.body, JSON.parse(user_data['projects']));
            if (result){ await waitForWeatherUpdate(0, result, 'projects') };
            return res.redirect(`/home/${username}`)
        };
    
        if(req.body.mark_done_todo){
            const result = await markDoneTodo(req.body, JSON.parse(user_data['projects']));
            if (result){ await waitForWeatherUpdate(0, result, 'projects') };
            return res.redirect(`/home/${username}`)
        };
    
        if(req.body.project_title_and_deadline_arr){
            const result = await projectTitleAndDeadlineArr(req.body, JSON.parse(user_data['projects']));
            if (result){ await waitForWeatherUpdate(0, result, 'projects') };
            return res.redirect(`/home/${username}`)
        };
    
        if(req.body.edit_obs_arr){
            const result = await editObsArr(req.body, JSON.parse(user_data['projects']));
            if (result){ await waitForWeatherUpdate(0, result, 'projects') };
            return res.redirect(`/home/${username}`)
        };
    
        if(req.body.remove_task_arr){
            const result = await removeTaskArr(req.body, JSON.parse(user_data['projects']));
            if (result){ await waitForWeatherUpdate(0, result, 'projects') };
            return res.redirect(`/home/${username}`)
        };

        if(req.body.acc_changes){
            const this_arr = checkMultipleReq(req.body.acc_changes);
            const result = await callVerifyPassword(this_arr[6], user_id);
            if (result){ await changePersonalInfo(this_arr, user_id) };
            return res.redirect(`/home/${username}`)
        };

        if(req.body.delete_acc){
            try{
                await db.query("DELETE FROM credential WHERE id = $1;",[user_id], async (err,result)=>{
                    if (err){ console.log('ERROR while DELETE FROM credential:', err.message) }
                    else{ console.log('USER DELETED. result.rowCount is:', result.rowCount) }
                })
            } catch (err2){ console.log(err2.message) };
            try{
                await db.query("DELETE FROM federated_credentials WHERE user_id = $1;",[user_id], async (err3,result2)=>{
                    if (err3){ console.log('ERROR while DELETE FROM credential:', err3.message) }
                    else{ console.log('USER DELETED. result.rowCount is:', result2.rowCount) }
                })
            } catch(err4){ console.log(err4.message) };
            return res.redirect('/login');
        };

        setTimeout(()=>{
            return res.redirect(`/home/${username}`)
        },3500)
    } else{
        if(req.session){req.session.destroy()}
        return res.redirect('/login')
    }
});

app.post('/login',
    passport.authenticate('local', { failureRedirect: '/registration_failed' }),
    async function(req, res) {
        const user_data_page = req.body;
        const time_place_obj = JSON.parse(user_data_page.time_place_obj_str);
        const user_data_raw = await db.query("SELECT * FROM work_data WHERE username = ($1)",[user_data_page.username]);
        const user_data = user_data_raw.rows[0];
        if( time_place_obj['UTC_hour'] != parseInt(user_data['last_utc_hour']) ||
            time_place_obj['timestamp'] > (parseInt(user_data['last_timestamp'])+3600000) ){
            await updateFromLogin(user_data, time_place_obj);
            res.redirect(`/home/${user_data_page.username}`)
        } else { res.redirect(`/home/${user_data_page.username}`) }
    }
);

app.post('/register', (req, res) => {
    const cred_arr = JSON.parse(req.body.cred_arr_str);
    if (cred_arr[0].length > 4 && cred_arr[0].slice(0,5).toLowerCase() == "guest" && cred_arr[1] != "pw_demo"){ return res.redirect('/user_unavailable')}
    const time_place_obj = JSON.parse(req.body.time_place_obj_str);
    const first_name = req.body.first_name;
    bcrypt.hash( ( (cred_arr[1])+(process.env.PEP) ), saltRounds, async function(err, hash) {
        if(err){
            console.log('ERROR in bcrypt.hash in POST/register:', err.message);
            await writeLog('ERROR in bcrypt.hash in POST/register:'+err.message, cred_arr[0], true);
            res.redirect('/registration_failed_A')
        } else {
            try{
                await registerUser( cred_arr[0], hash, first_name, time_place_obj );
                res.redirect('registration_successfull')
            } catch (err){
                console.log('ERROR catched in registerUser() in POST/register:', err.message);
                await writeLog('ERROR catched in registerUser() in POST/register:'+err.message, cred_arr[0], true);
                res.redirect('/user_unavailable')
            }
        }
    });
});

app.post('/demonstration', async (req, res)=>{
    let time_place_obj = JSON.parse(req.body.time_place_obj_str);
    const tmz_iana = time_place_obj['tmz_iana'];
    const dayA_obj = dayModule.dayA(tmz_iana); const dayA_key = dayA_obj['YYYY-MM-DD'];
    const dayB_obj = dayModule.dayB(tmz_iana); const dayB_key = dayB_obj['YYYY-MM-DD'];
    const dayC_obj = dayModule.dayC(tmz_iana); const dayC_key = dayC_obj['YYYY-MM-DD'];
    const user_h = time_place_obj['local_hour'];
    const Date_now = Date.now();
    const today_string = new Date(dayA_key).toUTCString().slice(0,16);
    const tomorrow = new Date(dayB_key);
    const tomorrow_string = tomorrow.toUTCString().slice(0,16);
    const after_tomorrow = new Date(dayC_key);
    const after_tomorrow_string = after_tomorrow.toUTCString().slice(0,16);
    const notes_obj = {};
    const routines = { 'weekly': {}, 'monthly': {}, 'highlight': {}};
    if (3 < user_h && user_h < 17 ){
        notes_obj[dayA_key] = {
            "weekday":dayA_obj['weekday'],
            "day": dayA_obj['day'],
            "notes":[
                ["Hi! *CLICK ME* These are the Notes, to remind you of important to-dos",Date_now+1,today_string],
                ["Until 16:59, you will see notes for today and tomorrow",Date_now+2,today_string],
                ["From 17:00 onwards, for tomorrow and after tomorrow",Date_now+3,today_string],
                ['You can add a new note by clicking on "new note..." ↓',Date_now+4,today_string],
                ["When you finish writing, click anywhere outside of it",Date_now+5,today_string],
            ]
        };
        notes_obj[dayB_key] = {
            "weekday":dayB_obj['weekday'],
            "day": dayB_obj['day'],
            "notes":[
                ["Right-click to see options",Date_now+6,tomorrow_string],
                ["...like highlighting!",Date_now+7,tomorrow_string],
                ["Or making a note repeat, weekly...",Date_now+8,tomorrow_string],
                ["or monthly, like this one! (at the same day of the month)",Date_now+9,tomorrow_string],
                ["You should also be seeing the weather forecast for this day (from 06 to 21h)",Date_now+10,tomorrow_string]
            ]
        };
        notes_obj[dayC_key] = {
            "weekday":dayC_obj['weekday'],
            "day": dayC_obj['day'],
            "notes":[]
        };
        routines['monthly'][(dayB_obj['day'])] = ["or monthly, like this one! (at the same day of the month)"];
        routines['highlight'][dayB_key] = [["...like highlighting!",Date_now+7]]
    } else{
        notes_obj[dayA_key] = {
            "weekday":dayA_obj['weekday'],
            "day": dayA_obj['day'],
            "notes":[]
        };
        notes_obj[dayB_key] = {
            "weekday":dayB_obj['weekday'],
            "day": dayB_obj['day'],
            "notes":[
                ["Hi! *CLICK ME* These are the Notes, to remind you of important to-dos",Date_now+1,tomorrow_string],
                ["Until 16:59, you will see notes for today and tomorrow",Date_now+2,tomorrow_string],
                ["From 17:00 onwards, for tomorrow and after tomorrow",Date_now+3,tomorrow_string],
                ['You can add a new note by clicking on "new note..." ↓',Date_now+4,tomorrow_string],
                ["When you finish writing, click anywhere outside of it",Date_now+5,tomorrow_string],
            ]
        };
        notes_obj[dayC_key] = {
            "weekday":dayC_obj['weekday'],
            "day": dayC_obj['day'],
            "notes":[
                ["Right-click to see options",Date_now+6,after_tomorrow_string],
                ["...like highlighting!",Date_now+7,after_tomorrow_string],
                ["Or making a note repeat, weekly...",Date_now+8,after_tomorrow_string],
                ["or monthly, like this one! (at the same day of the month)",Date_now+9,after_tomorrow_string],
                ["You should also be seeing the weather forecast for this day (from 06 to 21h)",Date_now+10,after_tomorrow_string]
            ]
        };
        routines['monthly'][(dayC_obj['day'])] = ["or monthly, like this one! (at the same day of the month)"];
        routines['highlight'][dayC_key] = [["...like highlighting!",Date_now+7]]
    };
    const dayD = dayModule.dayA(tmz_iana, Date_now+432000000);
    let dayD_string = new Date(dayD['YYYY-MM-DD']).toUTCString().slice(0,16);
    notes_obj[dayD['YYYY-MM-DD']] = {
        "weekday":dayD['weekday'],
        "day": dayD['day'],
        "notes":[
            ["These are some notes 5 days in the future",Date_now+46,dayD_string],
            ["To interact with them, use the calendar...",Date_now+47,dayD_string],
            ["... icon in the top-right corner",Date_now+48,dayD_string],
        ]
    };
    const buf_long_date = dayModule.dayA(tmz_iana, Date_now+15778800000);
    const dayE = dayModule.dayB(tmz_iana, Date_now+432000000);
    const dayF = dayModule.dayA(tmz_iana, Date_now+864000000);
    const dayG = dayModule.dayC(tmz_iana, Date_now+1900800000);
    const buf_projects = [{
        "title": "Project A",
        "final_deadline": buf_long_date['YYYY-MM-DD'],
        "tasks_todo":[
            {           
                "task": "A Project is a series of tasks, like this one",
                "obs":"",
                "deadline": false
            },
            {
                "task": "Both the Project and its tasks can",
                "obs":"",
                "deadline": false
            },
            {
                "task": "have their own deadlines, that you",
                "obs":"",
                "deadline": dayD['YYYY-MM-DD']
            },
            {
                "task": "can edit by right-clicking. Try this one",
                "obs":"Hi there! This is a task's observation. You see... since a project is something that takes one's considerable amount of time and possibly has a lot of tasks to complete, the tasks itselves are limited to 40 characters, so the screen doesn't get polluted by a loooooong task description. If you want to further detail a task, use this Observations field, since it's character limit is 2000",
                "deadline": dayE['YYYY-MM-DD']
            },
            {
                "task":"The title and deadline of the project...",
                "obs":"... can also be right-clicked, so you will also get options of what to do with them, like deleting the whole Project. You can also make changes to the weather forecast by right-clicking it.",
                "deadline": dayF['YYYY-MM-DD']
            },
            {
                "task":"If there is no weather forecast...",
                "obs":"... right below the notes up there, it is because the weather API failed to fetch data. The string used in AXIOS to get the weather forecast was: "+`https://api.open-meteo.com/v1/forecast?latitude=${time_place_obj['lat']}&longitude=${time_place_obj['lon']}&hourly=temperature_2m,weathercode&daily=sunrise,sunset&timezone=${tmz_iana}&forecast_days=3`,
                "deadline": dayG['YYYY-MM-DD']
            }
        ],    
        "tasks_done":[]
    }];

    const demo_obj = {
        'demo_notes_str': JSON.stringify(notes_obj),
        'demo_routines_str': JSON.stringify(routines),
        'demo_projects_str': JSON.stringify(buf_projects)
    };

    demo_username = req.body.username;
    bcrypt.hash( ( (req.body.password)+(process.env.PEP) ), saltRounds, async function(err, hash) {
        if(err){
            console.log('ERROR in bcrypt.hash in POST/demonstration:', err.message);
            await writeLog('ERROR in bcrypt.hash in POST/demonstration:'+err.message, req.body.username, true);
            res.redirect('/registration_failed_A')
        } else {
            try{
                await registerUser( demo_username, hash, "guest", time_place_obj, demo_obj);
                res.redirect('/demonstration')          
            } catch (err){
                console.log('ERROR catched in registerUser() in POST/demonstration:', err.message);
                await writeLog('ERROR catched in registerUser() in POST/demonstration:'+err.message, req.body.username, true);
                res.redirect('/user_unavailable')
            }
        }
    });
});

app.get('/registration_successfull', (req, res) => {
    res.render('reg_successfull')
});
app.post('/registration_successfull', (req, res) => {
    res.redirect('/login')
});
app.get('/user_unavailable', (req, res) => {
    res.render('user_unavailable')
});
app.post('/user_unavailable', (req, res) => {
    res.redirect('/login')
});
app.get('/registration_failed', (req, res) => {
    res.render('reg_failed')
});
app.post('/registration_failed', (req, res) => {
    res.redirect('/login')
});
app.get('/lost_access', (req, res) => {
    res.render('lost_access')
});
app.post('/lost_access', (req, res) => {
    res.redirect('/login')
});

app.listen(5001, function(){
    console.log("listening on port 5001");
});

process.on('uncaughtException', async (err) => {
    try{
        await fsPromises.appendFile(path.join(__dirname, 'logs','uncaught_errors.txt'), ("\n"+err.message+','+new Date().getTime()+','+new Date().toUTCString()))
    } catch (err){
        console.error(err.message)
    }
})