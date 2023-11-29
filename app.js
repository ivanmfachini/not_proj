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
        maxAge: 3000000 }            // 50min
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
        await db.query('SELECT * FROM credential WHERE username = ($1)', [username], async function (err,user){
            if (err) { console.log('ERROR in db.query in LocalStrategy:', err.message);
                return done(err)
            } else{
                try{ user = user.rows[0] }
                catch (err){ console.log('ERROR catched in try{ user = user.rows[0]:', err.message);
                    return done(null,false)
                };
                if (!user) { console.log('LocalStrategy: db.query returned no user');
                    return done(null, false)
                };
                let result = await verifyPassword( (password + (process.env.PEP)), user['password'] );
                if (result) { return done(null, user) }
                else{
                    console.log('LocalStrategy --> verifyPassword returned false, returning false');
                    return done(null, false)
                }
            }
        });
    }
));

passport.serializeUser(function(user, done) {
    done(null, user.id);
});
  
passport.deserializeUser(async function(id, done) {
    await db.query('SELECT * FROM credential WHERE id = ($1)', [id], function (err,user){
        if (err){ console.log('ERROR in db.query in deserializeUser:', err.message) }
        done(err, (user.rows[0]));
    });
});

const dayModule = require(__dirname + "/dayModule.js");
const weatherModule = require(__dirname + "/weatherModule.js");

async function queryAccId(in_id){
    return new Promise((resolve, reject)=>{
        db.query( "SELECT * FROM account WHERE id = ($1)", [in_id], (err, result)=>{
            if (err){ console.log('ERROR in db.query in queryAccId:', err.message); resolve(false) }
            resolve((result.rows)[0])
        })        
    })
};

async function queryAccUsername(in_username){
    return new Promise((resolve, reject)=>{
        db.query( "SELECT * FROM account WHERE username = ($1)", [in_username], (err, result)=>{
            if (err){ console.log('ERROR in db.query in queryAccUsername:', err.message); resolve(false) }
            resolve((result.rows)[0])
        })
    })
};

async function queryWorkDataId(in_id){
    return new Promise ((resolve, reject)=>{
        db.query( "SELECT * FROM work_data WHERE user_id = ($1)", [in_id], (err, result)=>{
            if (err){ console.log('ERROR in db.query in queryWorkDataId:', err.message); resolve(false) }
            resolve((result.rows)[0])
        })
    })
};

async function queryWorkDataUsername(in_username){
    return new Promise((resolve, reject)=>{
        db.query( "SELECT * FROM work_data WHERE username = ($1)", [in_username], (err, result)=>{
            if (err){ console.log('ERROR in db.query in queryWorkDataUsername:', err.message); resolve(false) }
            resolve((result.rows)[0])
        })
    })
};

async function updateWorkDataFromHome(in_data_db, in_local_hour, in_UTC_hour, in_timestamp){
    const loc_data = (JSON.parse(in_data_db['loc_data']))['last'];
    const weather_str = await weatherModule(loc_data['lat'], loc_data['lon'], loc_data['tmz_iana'], in_local_hour, in_data_db['temp_celsius']);
    if(weather_str){
        await db.query("UPDATE work_data SET (last_timestamp, last_local_hour, last_UTC_hour, weather) = ($1,$2,$3,$4) WHERE username = ($5)",
        [in_timestamp, in_local_hour, in_UTC_hour, weather_str, in_data_db['username']],
        (err, result) =>{
            if (err){
                console.log('ERROR in db.query in updateWorkDataFromHome:', err.message);
                return false
            }
            else{
                console.log('Successfully updated work_data of', in_data_db['username']);
                return(result.rows[0])
            }
        });
    } else{ return false }
}

async function updateWorkDataFromLogin(in_user_data, in_time_place_obj){
    let loc_data = JSON.parse(in_user_data['loc_data']);
    console.log('in_time_place_obj received:');
    console.log(in_time_place_obj);
    if ( !(in_time_place_obj['lat'] == -27.59 && in_time_place_obj['lon'] == -48.45) ){
        loc_data['last']['lat'] = in_time_place_obj['lat'];
        loc_data['last']['lon'] = in_time_place_obj['lon'];
        loc_data['last']['tmz_iana'] = in_time_place_obj['tmz_iana'];
        loc_data['last']['hour_offset'] = in_time_place_obj['hour_offset'];
        loc_data['last']['tmz_suffix'] = in_time_place_obj['tmz_suffix'];
        loc_data['last']['local_DateString'] = in_time_place_obj['local_DateString']
        const weather_str = await weatherModule(in_time_place_obj['lat'], in_time_place_obj['lon'], in_time_place_obj['tmz_iana'], in_time_place_obj['local_hour'], in_user_data['temp_celsius']);
        if(weather_str){
            await db.query("UPDATE work_data SET (last_timestamp, last_local_hour, last_UTC_hour, weather, loc_data) = ($1,$2,$3,$4,$5) WHERE username = ($6)",
            [
                in_time_place_obj['timestamp'], in_time_place_obj['local_hour'], in_time_place_obj['UTC_hour'], weather_str, JSON.stringify(loc_data),
                in_user_data['username']
            ],(err, result) =>{
                if (err){ console.log('ERROR in db.query (A) in updateWorkDataFromLogin:', err.message) }
                else{ console.log('Successfully (A) updated work_data of', in_user_data['username']) }
            });
        }
    } else{
        const weather_str = await weatherModule(loc_data['original']['lat'], loc_data['original']['lon'], loc_data['original']['tmz_iana'], in_time_place_obj['local_hour'], in_user_data['temp_celsius']);
        if(weather_str){
            await db.query("UPDATE work_data SET (last_timestamp, last_local_hour, last_UTC_hour, weather) = ($1,$2,$3,$4) WHERE username = ($5)",
            [
                in_time_place_obj['timestamp'], in_time_place_obj['local_hour'], in_time_place_obj['UTC_hour'], weather_str,
                in_user_data['username']
            ],(err, result) =>{
                if (err){ console.log('ERROR in db.query (B) in updateWorkDataFromLogin:', err.message) }
                else{ console.log('Successfully (B) updated work_data of', in_user_data['username']) }
            });
        }
    }
};

async function registerUser(in_username, in_hash, in_first_name, in_time_place_obj){
    let new_id = await db.query(
        'INSERT INTO credential(username, password) VALUES ($1, $2) RETURNING id;', [in_username, in_hash]
    );
    await db.query(
        'INSERT INTO account(user_id, username, first_name, first_pw, creation) VALUES ($1, $2, $3, $4, $5);',
        [((new_id.rows[0]).id), in_username, in_first_name, in_hash, in_time_place_obj['timestamp']],
        (err, result)=>{ if(err){ console.log('ERROR in db.query in registerUser:', err.message) } }
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
                        'local_DateString': in_time_place_obj['local_DateString'],
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana'],
                        'hour_offset': in_time_place_obj['hour_offset'],
                        'tmz_suffix': in_time_place_obj['tmz_suffix']
                    },
                    'original':{
                        'local_DateString': in_time_place_obj['local_DateString'],
                        'lat': in_time_place_obj['lat'],
                        'lon': in_time_place_obj['lon'],
                        'tmz_iana': in_time_place_obj['tmz_iana'],
                        'hour_offset': in_time_place_obj['hour_offset'],
                        'tmz_suffix': in_time_place_obj['tmz_suffix']
                    }
                }),
                true,                               // temp_celsius
                false                               // wtr_simple
            ]
        );
    }
};

app.get('/', (req, res) => {
    res.redirect('/login')
});

app.get('/home', (req, res) => {
    if(req.session){ res.redirect(`/home/${req.body.username}`) }
    else{ res.redirect('/login') }
});

app.get('/login', (req, res) => {
    res.render('login', {})
});

app.get('/registration_successful', (req, res) => {
    res.render('registration_successful')
});

app.get('/home/:username', async (req, res) => {
    if (!req.params.username || req.params.username == "undefined"){ return res.redirect('/login') }
    await db.query('SELECT * FROM session WHERE sid = ($1)',[req.sessionID], async (err,result)=>{
        if (err){ console.log('ERROR in db.query in GET /home/:username:', err.message);
            return res.redirect('/login')
        } else if(result.rows.length){
            if (  ((result.rows[0].expire).getTime()) < Date.now()  ){
                console.log('FAIL to login: cookie with sid', result.rows[0].sid, 'is expired!');
                return res.redirect('/login')
            };
            const user_id = result.rows[0].sess.passport.user;
            const user_data_db = await queryWorkDataId(user_id);
            if (!user_data_db){ return res.redirect('/login') };
            const username = user_data_db['username'];                      console.log('GET home/'+username);
            if (req.params.username != username){ console.log('req.params.username is', req.params.username, 'but username from db is', username, '. At', Date.now(), 'Redirecting to /login');
                return res.redirect('/login')
            };
            const notes = JSON.parse(user_data_db['notes']);                console.log(notes);
            const routines = JSON.parse(user_data_db['high_wly_mly']);      console.log(routines);
            const projects = JSON.parse(user_data_db['projects']);          console.log(projects);
            const weather = JSON.parse(user_data_db['weather']);            console.log(weather);
            const loc_data = (JSON.parse(user_data_db.loc_data))['last'];   console.log(loc_data);

            let dayA_obj = dayModule.dayA(loc_data['tmz_iana']), dayA_key = dayA_obj['YYYY-MM-DD'];
            let dayB_obj = dayModule.dayB(loc_data['tmz_iana']), dayB_key = dayB_obj['YYYY-MM-DD'];
            let dayC_obj = dayModule.dayC(loc_data['tmz_iana']), dayC_key = dayC_obj['YYYY-MM-DD'];
            let A_notes, B_notes, C_notes;

            if(notes[dayA_key]){ A_notes = JSON.stringify(notes[dayA_key]['notes']) }
            else{ A_notes = JSON.stringify([]) };
            if(notes[dayB_key]){ B_notes = JSON.stringify(notes[dayB_key]['notes']) }
            else{ B_notes = JSON.stringify([]) };
            if(notes[dayC_key]){ C_notes = JSON.stringify(notes[dayC_key]['notes']) }
            else{ C_notes = JSON.stringify([]) };

            res.render('index', {
                user_timezone_PH : loc_data['tmz_suffix'], current_hour_PH : user_data_db['last_local_hour'],
                dayA_PH: dayModule.dayA_pretty(), notesDayA_PH_string: A_notes, dayA_hidden_date_PH : dayA_key,
                dayB_PH: dayModule.dayB_pretty(), notesDayB_PH_string: B_notes, dayB_hidden_date_PH : dayB_key,
                dayC_PH: dayModule.dayC_pretty(), notesDayC_PH_string: C_notes, dayC_hidden_date_PH : dayC_key,
                routines_raw_PH_string: user_data_db['high_wly_mly'], username_PH: user_data_db['first_name'],
                mili_diff_PH: 1, projects_PH_str: user_data_db['projects'],
                days_7_PH : JSON.stringify([]) , days_31_PH : JSON.stringify([]),
                next_6h_PH : weather[0], next_day_PH : weather[1], day3_PH : weather[2],
                wtr_simple_PH : 0, celsius_PH : 1
            })
        } else{ console.log('NO COOKIE'); return res.redirect('/login') }
    })
});

app.post('/home', async function (req,res){
    const username = req.user.username;
    console.log('>>> POST /home', username);
    console.log(req.body); console.log(req.session); console.log(req.sessionID); //console.log(req.user); 
    const old_data_db = await queryWorkDataUsername(username); console.log(old_data_db);
    let user_data_db, user_hour_timestamp;
    
    if (req.body.user_hour_timestamp){
        const user_hour_timestamp_str = req.body.user_hour_timestamp;
        if (user_hour_timestamp_str[0].length > 1){
            console.log('WARNING! THERE WERE ' + user_hour_timestamp_str.length + ' OBJECTS IN user_hour_timestamp_str!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            user_hour_timestamp_str = user_hour_timestamp_str[user_hour_timestamp_str.length-1]
        };
        user_hour_timestamp = JSON.parse(user_hour_timestamp_str);
        const user_hour = user_hour_timestamp[0];
        const UTC_hour = user_hour_timestamp[1];
        const user_timestamp = user_hour_timestamp[2];
        if ((user_timestamp > (old_data_db['last_timestamp']+3600000)) ||
            (user_hour != old_data_db['last_local_hour'])){
            let buf_new_db = await updateWorkDataFromHome(old_data_db, user_hour, UTC_hour, user_timestamp)
            if (buf_new_db){ user_data_db = buf_new_db }
        }        
    };
    
    setTimeout(async () => {

        if(req.body.new_note_array){
            const new_note_array_str = req.body.new_note_array;
            if (new_note_array_str[0].length > 1){
                console.log('WARNING! THERE WERE ' + new_note_array_str.length + ' OBJECTS IN new_note_array_str!');
                console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
                new_note_array_str = new_note_array_str[new_note_array_str.length-1]
            };
            const new_note_array = JSON.parse(new_note_array_str);
            const new_key = new_note_array[0];
            const new_text = new_note_array[1];
            let user_data;
            if(user_data_db){ user_data = user_data_db }
            else{ console.log('user_data_db is (yet?):', user_data_db); user_data = old_data_db };
            const loc_data = (JSON.parse(user_data['loc_data']))['last'];
            const new_day_obj = new Date(new_key+loc_data['tmz_suffix']);
            let buf_day_str = new_day_obj.toString();
            let day_str;
            if (buf_day_str[9] == " "){
                buf_day_str = buf_day_str.slice(0,14);
                day_str = buf_day_str.substring(0,8) + "0" + buf_day_str.substring(8)
            } else{ day_str = buf_day_str.slice(0,15) }
            let notes = JSON.parse(user_data['notes']);
            if(notes[new_key]){ notes[new_key]['notes'].push([new_text, Date.now(), day_str]) }
            else{ notes[new_key] = {
                "weekday": new_day_obj.getDay(),
                "day": new_day_obj.getDate(),
                "notes": [[new_text, Date.now(), day_str]]
            }};
            await db.query("UPDATE work_data SET notes = $1 WHERE username = $2",
                [(JSON.stringify(notes)), username], (err, result)=>{
                    if (err){ console.log('ERROR in db.query in <if(req.body.new_note_array){> in POST /home', username,':',err.message) }
                    return res.redirect(`/home/${username}`)
                }
            )    
        }

    }, 50)
})

app.post('/login',
    passport.authenticate('local', { failureRedirect: '/fail' }), async function(req, res) {
        const user_data_page = req.body;
        const time_place_obj = JSON.parse(user_data_page.time_place_obj_str);
        const user_data_db_raw = await db.query("SELECT * FROM work_data WHERE username = ($1)",[user_data_page.username]);
        const user_data_db = user_data_db_raw.rows[0];
        const loc_data_db = (JSON.parse(user_data_db['loc_data']))["last"];
        if( time_place_obj['timestamp'] > (user_data_db['last_timestamp']+3600000) ||       // if 1h+ passed
            time_place_obj['UTC_hour'] != user_data_db['last_UTC_hour'] ){                  // if it's not the same hour
            console.log('fulfilled conditions to updateWorkDataFromLogin table');
            await updateWorkDataFromLogin(user_data_db, time_place_obj);
            return res.redirect(`/home/${user_data_page.username}`)
        } else{
            console.log('DID NOT fulfilled conditions to updateWorkDataFromLogin table');
            return res.redirect(`/home/${user_data_page.username}`)
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