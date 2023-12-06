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

/////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////    FUNCTIONS    //////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

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

async function updateTimeAndWeather(in_data_db, in_local_hour, in_UTC_hour, in_timestamp){
    const loc_data = (JSON.parse(in_data_db['loc_data']))['last'];
    const weather_str = await weatherModule(loc_data['lat'], loc_data['lon'], loc_data['tmz_iana'], in_local_hour, in_data_db['temp_celsius']);
    if(weather_str){
        await db.query("UPDATE work_data SET (last_timestamp, last_local_hour, last_UTC_hour, weather) = ($1,$2,$3,$4) WHERE user_id = ($5)",
        [in_timestamp, in_local_hour, in_UTC_hour, weather_str, in_data_db['user_id']],
        (err, result) =>{
            if (err){
                console.log('ERROR in db.query in updateTimeAndWeather:', err.message);
                return false
            }
            else{
                console.log('Successfully updated time and weather forecast of', in_data_db['username']);
                return(result.rows[0])
            }
        });
    } else { return false }
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
            ],(err, result) =>{
                if (err){ console.log('ERROR in db.query (A) in updateFromLogin:', err.message) }
                else{ console.log('Successfully (A) updated time and weather forecast of', in_user_data['username']) }
            });
        }
    } else {
        const weather_str = await weatherModule(loc_data['original']['lat'], loc_data['original']['lon'], loc_data['original']['tmz_iana'], in_time_place_obj['local_hour'], in_user_data['temp_celsius']);
        if(weather_str){
            await db.query("UPDATE work_data SET (last_timestamp, last_local_hour, last_UTC_hour, weather) = ($1,$2,$3,$4) WHERE user_id = ($5)",
            [
                in_time_place_obj['timestamp'], in_time_place_obj['local_hour'], in_time_place_obj['UTC_hour'], weather_str,
                in_user_data['user_id']
            ],(err, result) =>{
                if (err){ console.log('ERROR in db.query (B) in updateFromLogin:', err.message) }
                else{ console.log('Successfully (B) updated time and weather forecast of', in_user_data['username']) }
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
        console.log('weatherModule did not return a value for user', in_username + '. Will insert empty arr instead')
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

async function updateFromCall(in_column , JSON_str, user_id){
    if(!in_column || !JSON_str || !user_id){
        console.log('ERROR: updateFromCall requires three parameters (in_column, JSON_str, user_id)');
        return false
    } else{ return new Promise ((resolve, reject)=>{
        if (in_column.length == 2){
            db.query(`UPDATE work_data SET (${in_column[0]},${in_column[1]}) = ($1,$2) WHERE user_id = $3`,
                [JSON_str[0], JSON_str[1], user_id], (err, result)=>{
                    if (err){ console.log('ERROR in updateFromCall:',err.message);
                        resolve(err.message)
                    } else { resolve(true) }
                }
            )
        } else{
            db.query(`UPDATE work_data SET ${in_column} = $1 WHERE user_id = $2`,
                [JSON_str, user_id], (err, result)=>{
                    if (err){ console.log('ERROR in updateFromCall:',err.message);
                        resolve(err.message)
                    } else { resolve(true) }
                }
            )
        }
    })}
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
    console.log('FUNCTION received in_arr and user_data:');
    console.log(in_arr);
    console.log(user_data);
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
    console.log('WILL RETURN:');
    console.log(notes);
    console.log(routines);
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
    let buf_date, date_str, beginning, end;
    if (in_hour < 17 && in_hour > 3){
        beginning = 2; end = 9
    } else{
        beginning = 3; end = 10
    };    
    Object.entries(weekly).forEach(([key, value]) => {
        for (let d = beginning; d < end; d+= 1){
            for (let k = 0; k < 5; k++){                            // iterate 1~4 weeks
                buf_date = new Date (now_timestamp + ((d*86400000)+(k*604800000)));
                if (buf_date.getUTCDay() == key){
                    date_str = buf_date.toUTCString().slice(0,16);
                    if (d < 8){
                        if(!k){                                     // goes to days_7
                            buffer7 = addToDaysArrFromRoutines(days_7, value, buf_date, date_str)
                        } else{       
                            buffer31 = addToDaysArrFromRoutines(days_31, value, buf_date, date_str)
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

function handleMonthly(monthly, now_timestamp, days_7, days_31, user_yyyymmdd, in_local_hour){
    let buffer7 = days_7;
    let buffer31 = days_31;

    let year_str = user_yyyymmdd.slice(0,4);    //0123-56-89
    let month_str = user_yyyymmdd.slice(5,7);

    Object.entries(monthly).forEach(([key, value]) => {
        let buf_day, buf_date, buf_timestamp, date_str, margin;

        if (key > 28){
            buf_day = key.toString();
            buf_date = new Date(year_str+'-'+month_str+'-'+buf_day+"T00:00:00.000");
            if (in_local_hour < 17 && in_local_hour > 3){ margin = 172800000 }
            else{ margin = 259200000 };
            if (buf_date.getTime() - now_timestamp < margin){
                buf_timestamp = buf_date.getTime() + 2678400000;            // +31d
                buf_date = new Date(buf_timestamp);
                let current_day = buf_date.getUTCDate();
                let k = 1
                while(current_day < 6){
                    buf_date = new Date(buf_timestamp - (k * 86400000));
                    current_day = buf_date.getUTCDate();
                    k += 1
                }
            }
        } else{
            if (key < 10){ buf_day = "0" + key.toString() }
            else { buf_day = key.toString() };
            buf_date = new Date(year_str+'-'+month_str+'-'+buf_day+"T00:00:00.000");
            if (in_local_hour < 17 && in_local_hour > 3){ margin = 172800000 }
            else{ margin = 259200000 };
            if (buf_date.getTime() - now_timestamp < margin){
                month_str = parseInt(month_str)+1;
                if (month_str == 13){
                    month_str = "01";
                    year_str = (parseInt(year_str)+1).toString()
                } else if (month_str < 10){ month_str = "0" + month_str.toString() }
                else{ month_str = month_str.toString() };
                buf_date = new Date(year_str+'-'+month_str+'-'+buf_day+"T00:00:00.000")
            }
        };
        date_str = buf_date.toUTCString().slice(0,16);
        buf_timestamp = buf_date.getTime();
        if (buf_timestamp < now_timestamp + 691200000){             // goes to days_7
            buffer7 = addToDaysArrFromRoutines(days_7, value, buf_date, date_str)
        } else{                                                     // goes to days_31
            buffer31 = addToDaysArrFromRoutines(days_31, value, buf_date, date_str)
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

function iterate31days(in_notes, in_timestamp, in_local_hour){
    let buf_7 = [];
    let buf_31 = [];
    let buf_date, day_notes, date_str, margin;
    Object.entries(in_notes).forEach(([key, value]) => {
        buf_date = new Date(key+"T00:00:00.000");
        day_notes = value['notes'];
        if (in_local_hour < 17 && in_local_hour > 3){ margin = 172800000 }
        else{ margin = 259200000 };
        if (buf_date.getTime() < in_timestamp + margin){}                   // in the past or today or tomorrow
        else if (buf_date.getTime() < in_timestamp + 2764800000){           // < 32
            date_str = buf_date.toUTCString().slice(0,16);
            if (buf_date.getTime() < in_timestamp + 691200000){             // < 8
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
            [new_value, user_id], (err,result)=>{
                if (err){
                    console.log('could not change temp unit:', err.message)
                    resolve(false)
                } else{resolve(true)}
            })
        } else{
            if (new_value == 0 || new_value == "0") { new_value = false }
            else                                    { new_value = true }
            db.query("SELECT weather FROM work_data WHERE user_id = $1", [user_id], (err, result)=>{
                if (err){
                    console.log('could not fetch user:', err.message);
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
                            value['hr_tmp_code'] = tmp_values
                        })
                    };
                    db.query("UPDATE work_data SET (weather, temp_celsius) = ($1,$2) WHERE user_id = $3",
                    [JSON.stringify(this_weather), new_value, user_id], (err,result)=>{
                        if (err){
                            console.log('could not change temp unit:', err.message);
                            resolve(false)
                        } else{ resolve(true) }
                    })
                }
            })
        }
    })
};


//////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////    ROUTES    //////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////

app.get('/', (req, res) => {
    res.redirect('/login')
});

app.get('/home', async (req, res) => {        //http://localhost:3000/home?new_y=2023&new_m=11&new_d=6
    if(req.session && req.user){
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
        });
    } else { res.redirect('/login') }
});

app.get('/login', (req, res) => {
    res.render('login', {})
});

app.get('/registration_successful', (req, res) => {
    res.render('registration_successful')
});

app.get('/home/:username', async (req, res) => {
    if (req.params.username == "undefined"){ return res.redirect('/login') }
    await db.query('SELECT * FROM session WHERE sid = ($1)',[req.sessionID], async (err,result)=>{
        if (err){ console.log('ERROR in db.query in GET /home/:username:', err.message);
            return res.redirect('/login')
        } else if(result.rows.length){
            const new_date_obj = new Date();
            const now_timestamp = new_date_obj.getTime();
            if (  ((result.rows[0].expire).getTime()) < now_timestamp ){
                console.log('FAIL to login: cookie with sid', result.rows[0].sid, 'is expired!');
                return res.redirect('/login')
            };
            const user_id = result.rows[0].sess.passport.user;
            const user_data = await queryWorkDataId(user_id);
            if (!user_data){ return res.redirect('/login') };
            const username = user_data['username'];                      console.log('GET home/'+username);
            if (req.params.username != username){ console.log('req.params.username is', req.params.username, 'but username from db is', username, '. At', Date.now(), 'Redirecting to /login');
                return res.redirect('/login')
            };
            const notes =       JSON.parse(user_data['notes']);                     //console.log(notes);
            const routines =    JSON.parse(user_data['high_wly_mly']);              //console.log(routines);
            const projects =    user_data['projects'];                              //console.log(projects);
            const weather =     user_data['weather'];                               //console.log(weather);
            const loc_data =    (JSON.parse(user_data.loc_data))['last'];           //console.log(loc_data);
            const weekly =      routines['weekly'];
            const monthly =     routines['monthly'];
            const user_yyyymmdd = loc_data['YYYY-MM-DD'];
            const today_timestamp = new Date(user_yyyymmdd+"T00:00:00.000").getTime();
            let buffer_arrays;

            buffer_arrays = iterate31days(notes, today_timestamp, user_data['last_local_hour']);
            let days_7 = buffer_arrays[0];
            let days_31 = buffer_arrays[1];
            //console.log('days_7 and days_31 adding existing notes:'); console.log(days_7); console.log(days_31);

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
            //console.log('days_7 and days_31 after adding routines:'); console.log(days_7); console.log(days_31);
            
            let dayA_obj, dayA_key, dayB_obj, dayB_key, dayC_obj, dayC_key, A_notes, B_notes, C_notes, new_date_q, new_timestamp, mili_diff, dayA_wtr, dayB_wtr, dayC_wtr;
            if(req.query.new_y){
                let q_m = (parseInt(req.query.new_m)+1).toString(); if (q_m.length == 1){ q_m = "0"+q_m };
                let q_d = req.query.new_d; if (q_d.length == 1){ q_d = "0"+q_d };
                const key_str = req.query.new_y + '-' + q_m + '-' + q_d;
                if( loc_data['YYYY-MM-DD'] != key_str ){
                    new_date_q = new Date(key_str + loc_data['tmz_suffix']);
                    new_timestamp = new_date_q.getTime();
                    mili_diff = new_timestamp - new_date_obj.getTime();
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
            if(!new_timestamp){ new_timestamp = new_date_obj.getTime() };

            const empty_arr_str = JSON.stringify([]);
            try{ A_notes = JSON.stringify(notes[dayA_key]['notes']) }
            catch{ A_notes = empty_arr_str };
            try{ B_notes = JSON.stringify(notes[dayB_key]['notes']) }
            catch{ B_notes = empty_arr_str };
            try{ C_notes = JSON.stringify(notes[dayC_key]['notes']) }
            catch{ C_notes = empty_arr_str };

            res.render('index', {
                tmz_suffix_PH : loc_data['tmz_suffix'], current_hour_PH : user_data['last_local_hour'],
                dayA_PH: dayModule.dayA_pretty(new_timestamp), notesDayA_PH_string: A_notes, dayA_hidden_date_PH : dayA_key,
                dayB_PH: dayModule.dayB_pretty(new_timestamp), notesDayB_PH_string: B_notes, dayB_hidden_date_PH : dayB_key,
                dayC_PH: dayModule.dayC_pretty(new_timestamp), notesDayC_PH_string: C_notes, dayC_hidden_date_PH : dayC_key,
                routines_raw_PH_string: user_data['high_wly_mly'], first_name_PH: user_data['first_name'],
                mili_diff_PH: mili_diff, projects_PH_str: user_data['projects'], username_PH: username,
                days_7_PH : JSON.stringify(days_7) , days_31_PH : JSON.stringify(days_31), weather_PH: weather,
                wtr_simple_PH: user_data['wtr_simple'], celsius_PH: user_data['temp_celsius']
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
    const user_id = req.user.id;
    console.log('POST /home', username); console.log(req.body); console.log(req.user);  //console.log(req.session); console.log(req.sessionID);
    const old_user_data = await queryWorkDataId(user_id); //console.log(old_user_data);
    let user_hour, upd_user_data, user_hour_timestamp;
    
    if (req.body.user_hour_timestamp){
        user_hour_timestamp = checkMultipleReq(req.body.user_hour_timestamp);
        user_hour = user_hour_timestamp[0];
        const UTC_hour = user_hour_timestamp[1];
        const user_timestamp = user_hour_timestamp[2];
        if ((user_timestamp > (old_user_data['last_timestamp']+3600000)) ||
            (user_hour != old_user_data['last_local_hour'])){
            let buf_new_db = await updateTimeAndWeather(old_user_data, user_hour, UTC_hour, user_timestamp)
            if (buf_new_db){ upd_user_data = buf_new_db }
        } else { upd_user_data = false }
    };

    const interval_ID_obj = {
        'itv_HdlNot' : undefined,
        'itv_HdlRtn' : undefined
    };
    async function handleNotes(in_notes_arr, in_itv_A, in_task){
        if (upd_user_data == undefined){
            console.log('CCCCCCCCCCC:', in_itv_A);
            if(in_itv_A > 100){
                console.log('Something went wrong. Check function updateTimeAndWeather. Aborting.');
                clearInterval(interval_ID_obj['itv_HdlNot']);
                return false
            } else {
                interval_ID_obj['itv_HdlNot'] = setInterval(()=>{
                    return handleNotes(in_notes_arr, in_itv_A+1, in_task)
                },50)
            }
        } else if(upd_user_data){
            console.log('AAAAAAAAAAA');
            if (in_itv_A) { clearInterval(interval_ID_obj['itv_HdlNot']) };
            let result_c;
            if (in_task == 'add'){          result_c = await updateFromCall('notes', newNotesStrNew (in_notes_arr, upd_user_data), user_id ) }
            else if (in_task == 'edit'){    result_c = await updateFromCall('notes', newNotesStrEdit(in_notes_arr, upd_user_data), user_id ) }            
            else if (in_task == 'rm'){      result_c = await updateFromCall('notes', newNotesStrRm  (in_notes_arr, upd_user_data), user_id ) }
            else if (in_task == 'editrtn'){ result_c = await updateFromCall(['notes', 'routines'], newNotesStrEditRtn(in_notes_arr, upd_user_data), user_id ) }
            return result_c
        } else {
            console.log('BBBBBBBBBBB');
            if (in_itv_A) { clearInterval(interval_ID_obj['itv_HdlNot']) };
            let result_c;
            if (in_task == 'add'){          result_c = await updateFromCall('notes', newNotesStrNew (in_notes_arr, old_user_data), user_id ) }
            else if (in_task == 'edit'){    result_c = await updateFromCall('notes', newNotesStrEdit(in_notes_arr, old_user_data), user_id ) }            
            else if (in_task == 'rm'){      result_c = await updateFromCall('notes', newNotesStrRm  (in_notes_arr, old_user_data), user_id ) }
            else if (in_task == 'editrtn'){ result_c = await updateFromCall(['notes', 'high_wly_mly'], newNotesStrEditRtn(in_notes_arr, old_user_data), user_id ) }//[in_key, checker, in_old_text, in_timestamp, in_class, true, A_day_key]
            return result_c
        }
    };

    async function handleRoutines(in_rtn_arr, in_itv_B){
        if (upd_user_data == undefined){
            if(in_itv_B > 100){
                console.log('Something went wrong. Check function updateTimeAndWeather. Aborting.');
                clearInterval(interval_ID_obj['itv_HdlRtn']);
                return false
            } else {
                interval_ID_obj['itv_HdlRtn'] = setInterval(()=>{
                    return handleRoutines(in_rtn_arr,in_itv_B+1)
                },50)
            }
        } else if(upd_user_data){
            if (in_itv_B) { clearInterval(interval_ID_obj['itv_HdlRtn']) };
            const result_c = await updateFromCall('high_wly_mly', newRtnStr(in_rtn_arr, upd_user_data), user_id )
            return result_c
        } else {
            if (in_itv_B) { clearInterval(interval_ID_obj['itv_HdlRtn']) };
            const result_c = await updateFromCall('high_wly_mly', newRtnStr(in_rtn_arr, old_user_data), user_id )
            return result_c
        }
    };

    if(req.body.new_note_arr){
        const new_note_arr = checkMultipleReq(req.body.new_note_arr);
        const result = await handleNotes(new_note_arr, 0, 'add');
        console.log('Result from inserting a new note for', username, 'was:', result);
        return res.redirect(manageReturn(new_note_arr[2], new_note_arr[3], user_hour, username))
    };

    if(req.body.edit_note_arr){
        const edit_note_arr = checkMultipleReq(req.body.edit_note_arr);
        const result = await handleNotes(edit_note_arr, 0, 'edit');
        console.log('Result from editing a note for', username, 'was:', result);
        return res.redirect(manageReturn(edit_note_arr[3], edit_note_arr[4], user_hour, username))
    };

    if(req.body.remove_note_arr){
        const remove_note_arr = checkMultipleReq(req.body.remove_note_arr);
        const result = await handleNotes(remove_note_arr, 0, 'rm');
        console.log('Result from removing a note for', username, 'was:', result);
        return res.redirect(manageReturn(remove_note_arr[2], remove_note_arr[3], user_hour, username))
    };

    if(req.body.routine_note_arr){
        const routine_note_arr = checkMultipleReq(req.body.routine_note_arr);
        const result = await handleRoutines(routine_note_arr, 0);
        console.log('Result from inserting a new routine for', username, 'was:', result);
        return res.redirect(manageReturn(routine_note_arr[4], routine_note_arr[5], user_hour, username))
    };

    if(req.body.edit_routine_note){
        const edit_routine_note = checkMultipleReq(req.body.edit_routine_note);
        const result = await handleNotes(edit_routine_note, 0, 'editrtn');
        console.log('Result from editing a routine note for', username, 'was:', result);
        return res.redirect(manageReturn(edit_routine_note[5], edit_routine_note[6], user_hour, username))
    };

    if(req.body.temp_letter){
        const temp_letter = checkMultipleReq(req.body.temp_letter);
        await handleWeatherChange(temp_letter, user_id);
        return res.redirect(`/home/${username}`)
    };
        

});

app.post('/login',
    passport.authenticate('local', { failureRedirect: '/fail' }), async function(req, res) {
        const user_data_page = req.body;
        const time_place_obj = JSON.parse(user_data_page.time_place_obj_str);
        const user_data_raw = await db.query("SELECT * FROM work_data WHERE username = ($1)",[user_data_page.username]);
        const user_data = user_data_raw.rows[0];
        if( time_place_obj['UTC_hour'] != parseInt(user_data['last_utc_hour']) ||
            time_place_obj['timestamp'] > (parseInt(user_data['last_timestamp'])+3600000) ){
            console.log('Fulfilled conditions to call updateFromLogin');
            await updateFromLogin(user_data, time_place_obj);
            return res.redirect(`/home/${user_data_page.username}`)
        } else {
            console.log('DID NOT fulfilled conditions to call updateFromLogin');
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