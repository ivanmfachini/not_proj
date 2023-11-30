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
            } else {
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
    } else { return false }
};

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
    } else {
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

function checkMultipleReq(in_obj){
    if (in_obj[0].length > 1){
        console.log('WARNING! There were', in_obj.length,'objects in the last request! Will proceed only with the last.');
        return (JSON.parse(in_obj[in_obj.length-1]))
    };
    return JSON.parse(in_obj);
};

async function updateNotes(notes_str, username){
    if(!notes_str || !username){
        console.log('ERROR: updateNotes requires two parameters (notes_str, username)');
        return false
    } else{ return new Promise ((resolve, reject)=>{
        db.query("UPDATE work_data SET notes = $1 WHERE username = $2",
            [notes_str, username], (err, result)=>{
                if (err){ console.log('ERROR in updateNotes(notes,', username+'):',err.message);
                    resolve(err.message)
                } else { resolve(true) }
            }
        )
    })}
};

function newNotesStrNew(new_note_array, user_data){
    console.log('FUNCTION newNotesStrNew(',new_note_array, user_data,')');
    const new_key = new_note_array[0];
    const new_text = new_note_array[1];
    const loc_data = (JSON.parse(user_data['loc_data']))['last'];
    const new_day_obj = new Date(new_key+loc_data['tmz_suffix']);
    let buf_day_str = new_day_obj.toString();
    let day_str;
    if (buf_day_str[9] == " "){
        buf_day_str = buf_day_str.slice(0,14);
        day_str = buf_day_str.substring(0,8) + "0" + buf_day_str.substring(8)
    } else { day_str = buf_day_str.slice(0,15) }
    let notes = JSON.parse(user_data['notes']);
    if(notes[new_key]){ notes[new_key]['notes'].push([new_text, Date.now(), day_str]) }
    else{ notes[new_key] = {
        "weekday": new_day_obj.getDay(),
        "day": new_day_obj.getDate(),
        "notes": [[new_text, Date.now(), day_str]]
    }};
    let return_str = JSON.stringify(notes);
    console.log('FUNCTION newNotesStrNew will return:', return_str);
    return return_str
};

function newNotesStrEdit(edit_note_array, user_data){
    const new_key = edit_note_array[0];
    const new_text = edit_note_array[1];
    const edit_timestamp = edit_note_array[2];
    let notes = JSON.parse(user_data['notes']);
    let notes_key = notes[new_key]['notes'];
    for (let i = 0; i < notes_key.length; i++){
        if(notes_key[i][1] == edit_timestamp){
            notes_key[i][0] = new_text;
            break
        }
    };
    notes[new_key]['notes'] = notes_key;
    return JSON.stringify(notes)
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
            const upd_user_data = await queryWorkDataId(user_id);
            if (!upd_user_data){ return res.redirect('/login') };
            const username = upd_user_data['username'];                      console.log('GET home/'+username);
            if (req.params.username != username){ console.log('req.params.username is', req.params.username, 'but username from db is', username, '. At', Date.now(), 'Redirecting to /login');
                return res.redirect('/login')
            };
            const notes = JSON.parse(upd_user_data['notes']);                console.log(notes);
            const routines = JSON.parse(upd_user_data['high_wly_mly']);      //console.log(routines);
            const projects = JSON.parse(upd_user_data['projects']);          //console.log(projects);
            const weather = JSON.parse(upd_user_data['weather']);            //console.log(weather);
            const loc_data = (JSON.parse(upd_user_data.loc_data))['last'];   //console.log(loc_data);

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
                user_timezone_PH : loc_data['tmz_suffix'], current_hour_PH : upd_user_data['last_local_hour'],
                dayA_PH: dayModule.dayA_pretty(), notesDayA_PH_string: A_notes, dayA_hidden_date_PH : dayA_key,
                dayB_PH: dayModule.dayB_pretty(), notesDayB_PH_string: B_notes, dayB_hidden_date_PH : dayB_key,
                dayC_PH: dayModule.dayC_pretty(), notesDayC_PH_string: C_notes, dayC_hidden_date_PH : dayC_key,
                routines_raw_PH_string: upd_user_data['high_wly_mly'], username_PH: upd_user_data['first_name'],
                mili_diff_PH: 1, projects_PH_str: upd_user_data['projects'],
                days_7_PH : JSON.stringify([]) , days_31_PH : JSON.stringify([]),
                next_6h_PH : weather[0], next_day_PH : weather[1], day3_PH : weather[2],
                wtr_simple_PH : 0, celsius_PH : 1
            })
        } else { console.log('NO COOKIE'); return res.redirect('/login') }
    })
});

app.post('/home', async function (req,res){

    if(req.body.logout){                                    // logout from home page
        req.session.destroy();
        return res.redirect('/login')
    };

    const username = req.user.username;
    console.log('>>> POST /home', username);
    console.log(req.body); //console.log(req.session); console.log(req.sessionID); console.log(req.user); 
    const old_user_data = await queryWorkDataUsername(username); //console.log(old_user_data);

    let upd_user_data, user_hour_timestamp;
    
    if (req.body.user_hour_timestamp){
        user_hour_timestamp = checkMultipleReq(req.body.user_hour_timestamp);
        const user_hour = user_hour_timestamp[0];
        const UTC_hour = user_hour_timestamp[1];
        const user_timestamp = user_hour_timestamp[2];
        if ((user_timestamp > (old_user_data['last_timestamp']+3600000)) ||
            (user_hour != old_user_data['last_local_hour'])){
            let buf_new_db = await updateWorkDataFromHome(old_user_data, user_hour, UTC_hour, user_timestamp)
            if (buf_new_db){ upd_user_data = buf_new_db }
        } else { upd_user_data = false }
    };

    const interval_ID_obj = { 'int_updateNotes' : undefined };
    async function updateNotes(in_notes_arr, in_interval_A, in_task){
        console.log('FUNCTION updateNotes(',in_notes_arr, in_interval_A, in_task,')');
        if (upd_user_data == undefined){
            if(in_interval_A > 100){
                console.log('Something went wrong. Check function updateWorkDataFromHome. Aborting.');
                clearInterval(interval_ID_obj['int_updateNotes']);
                try{ delete (interval_ID_obj['int_updateNotes']) }
                catch (err){ console.log('ERROR catched in try{ delete (interval_ID_obj["int_updateNotes"]) }:', err.message) }
                finally{ return false }
            } else {
                interval_ID_obj['int_updateNotes'] = setInterval(()=>{
                    return updateNotes(in_notes_arr,in_interval_A+1, in_task)
                },50)
            }
        } else if(upd_user_data){
            if (in_interval_A) {
                clearInterval(interval_ID_obj['int_updateNotes']);
                try{ delete (interval_ID_obj['int_updateNotes']) }
                catch (err){ console.log('ERROR catched in try{ delete (interval_ID_obj["int_updateNotes"]) }:', err.message) }
            };
            let result_c;
            if (in_task == 'add'){ result_c = await updateNotes( (newNotesStrNew(in_notes_arr, upd_user_data)), username ) }
            else if (in_task == 'edit'){ result_c = await updateNotes( newNotesStrEdit(in_notes_arr, upd_user_data), username ) }            
            return result_c
        } else {
            if (in_interval_A) {
                clearInterval(interval_ID_obj['int_updateNotes']);
                try{ delete (interval_ID_obj['int_updateNotes']) }
                catch (err){ console.log('ERROR catched in try{ delete (interval_ID_obj["int_updateNotes"]) }:', err.message) }
            };
            let result_c;
            if (in_task == 'add'){ result_c = await updateNotes( (newNotesStrNew(in_notes_arr, old_user_data)), username ) }
            else if (in_task == 'edit'){ result_c = await updateNotes( newNotesStrEdit(in_notes_arr, old_user_data), username ) }            
            return result_c
        }
    };

    if(req.body.new_note_array){
        const new_note_array = checkMultipleReq(req.body.new_note_array);
        let result = await updateNotes(new_note_array, 0, 'add');
        console.log('Result from inserting a new note for', username, 'was:', result);
        return res.redirect(`/home/${username}`)
    };

    if(req.body.edit_note_array){
        const edit_note_array = checkMultipleReq(req.body.edit_note_array);
        let result = await updateNotes(edit_note_array, 0, 'edit');
        console.log('Result from editing a note for', username, 'was:', result);
        return res.redirect(`/home/${username}`)
    };

    if(req.body.remove_note_array){
        const remove_note_array = checkMultipleReq(req.body.remove_note_array);
        const new_key = remove_note_array[0];
        const del_timestamp = remove_note_array[1];
        let user_data;
        if(upd_user_data){ user_data = upd_user_data }
        else{ console.log('upd_user_data is (yet?):', upd_user_data); user_data = old_user_data };
        let notes = JSON.parse(user_data['notes']);
        let notes_key = notes[new_key]['notes'];
        for (let i = 0; i < notes_key.length; i++){
            if(notes_key[i][1] == del_timestamp){
                notes_key.splice(i,1);
                break 
            }
        };
        if (notes_key.length){ notes[new_key]['notes'] = notes_key }
        else{ delete notes.new_key };
        await db.query("UPDATE work_data SET notes = $1 WHERE username = $2",
            [(JSON.stringify(notes)), username], (err, result)=>{
                if (err){ console.log('ERROR in db.query in <if(req.body.delete_note_array){> in POST /home', username,':',err.message) }
                if (upd_user_data != undefined) { return res.redirect(`/home/${username}`) };
                let wait_cycles = 0;
                setInterval(() => {
                    if (upd_user_data != undefined || wait_cycles > 16) { return res.redirect(`/home/${username}`) }
                    wait_cycles += 1
                }, 200)
            }
        )
    };

    if(req.body.routine_note_array){
        const routine_note_array_str = req.body.routine_note_array;
        if (routine_note_array_str[0].length > 1){
            console.log('WARNING! THERE WERE ' + routine_note_array_str.length + ' OBJECTS IN routine_note_array_str!');
            console.log('FUNCTION CONTINUING CONSIDERING ONLY THE LAST ONE...');
            routine_note_array_str = routine_note_array_str[routine_note_array_str.length-1]
        };
        const routine_note_array = JSON.parse(routine_note_array_str);
        const new_key = routine_note_array[0];
        const routine_timestamp = routine_note_array[1];
        let user_data;
        if(upd_user_data){ user_data = upd_user_data }
        else{ console.log('upd_user_data is (yet?):', upd_user_data); user_data = old_user_data };
        let routines = JSON.parse(user_data['high_wly_mly']);

    }

})

app.post('/login',
    passport.authenticate('local', { failureRedirect: '/fail' }), async function(req, res) {
        const user_data_page = req.body;
        const time_place_obj = JSON.parse(user_data_page.time_place_obj_str);
        const upd_user_data_raw = await db.query("SELECT * FROM work_data WHERE username = ($1)",[user_data_page.username]);
        const upd_user_data = upd_user_data_raw.rows[0];
        const loc_data_db = (JSON.parse(upd_user_data['loc_data']))["last"];
        if( time_place_obj['timestamp'] > (upd_user_data['last_timestamp']+3600000) ||       // if 1h+ passed
            time_place_obj['UTC_hour'] != upd_user_data['last_UTC_hour'] ){                  // if it's not the same hour
            console.log('fulfilled conditions to updateWorkDataFromLogin table');
            await updateWorkDataFromLogin(upd_user_data, time_place_obj);
            return res.redirect(`/home/${user_data_page.username}`)
        } else {
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
        } else {
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