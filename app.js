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

async function getWeather(in_lat, in_lon, in_tmz_iana, in_hour, in_cel = true, in_id = false){
    console.log('FUNCTION getWeather('+in_lat, in_lon, in_tmz_iana, in_hour, in_cel, in_id+')');
    if (in_cel){
        in_cel = "";
    } else{
        in_cel = "temperature_unit=fahrenheit&";                            // in_cel is taken from the TASKS TABLE. If it is 1, converts to an empty string, since the open-meteo API returns in ºC by default.
    }                                                                       // To return the temperatures in ºF, the API requires a modifier, which is given if in_cel == 0.
    let string_to_axios = `https://api.open-meteo.com/v1/forecast?latitude=${in_lat}&longitude=${in_lon}&hourly=temperature_2m,weathercode&${in_cel}daily=sunrise,sunset&timezone=${in_tmz_iana}&forecast_days=3`
    try{
        let axios_response = await axios.get(string_to_axios, {timeout : 2200})
        let tmp_arr = axios_response.data.hourly.temperature_2m;            // temperatures array is stored
        let cod_arr = axios_response.data.hourly.weathercode;               // weather codes array is stored
        let next_6h_hrs = [];                                               // array to store data for the next 6h is declared
        in_hour = parseInt(in_hour);
        for (let q = 1; q < 7; q++){                                        // strings like "12", "13"... representing the next 6 hours are assigned
            let curr_hour_buf = in_hour + q;
            if (curr_hour_buf > 9){
                if (curr_hour_buf < 24){
                    next_6h_hrs.push(((curr_hour_buf).toString()))
                } else{
                    next_6h_hrs.push( "0" + (curr_hour_buf - 24).toString() )
                }
            } else{
                next_6h_hrs.push("0" + (curr_hour_buf.toString()))
            }
        }
        let next_6h_tmp = tmp_arr.slice(in_hour+1, in_hour+7);              // only the temperatures for the next 6h are assigned
        let next_6h_cod = cod_arr.slice(in_hour+1, in_hour+7);              // only the weather codes for the next 6h are assigned
        let day1_sunrise = parseInt((axios_response.data.daily.sunrise)[0].slice(11,13));
        let day1_sunset = parseInt((axios_response.data.daily.sunset)[0].slice(11,13));
        let next_6h_data = [next_6h_hrs, next_6h_cod, next_6h_tmp, day1_sunrise, day1_sunset];      // the array for the next 6h is ready...
        let next_6h_string = JSON.stringify(next_6h_data);                                          // ...and stringified
    
        let day2_tmp = tmp_arr.slice(30, 46);                               // an array with the temperatures between 06h and 21h for the next day is declared and assigned
        let day2_cod = cod_arr.slice(30, 46);                               // an array with the weather codes between 06h and 21h for the next day is declared and assigned
        let max_tmp_day2 = [-999, -9];                                      // an array for the MAX temps for the next day (between 06h and 21h) is declared and assigned with buffer values
        let min_tmp_day2 = [999, -9];                                       // an array for the MIN temps for the next day (between 06h and 21h) is declared and assigned with buffer values
        let codes_day2_6_9_12_15_18_21 = [  day2_cod[0], day2_tmp[0], day2_cod[3], day2_tmp[3],
                                            day2_cod[6], day2_tmp[6], day2_cod[9], day2_tmp[9],
                                            day2_cod[12], day2_tmp[12], day2_cod[15], day2_tmp[15]
                                        ];
        for (let i = 0; i < 16; i++){                                       // assigns the real MAX and MIN temps for the next day
            if (day2_tmp[i] > max_tmp_day2[0]){
                max_tmp_day2[0] = day2_tmp[i];
                max_tmp_day2[1] = i+6
            };
            if (day2_tmp[i] < min_tmp_day2[0]){
                min_tmp_day2[0] = day2_tmp[i];
                min_tmp_day2[1] = i+6
            }
        };
        let day2_sunrise = parseInt((axios_response.data.daily.sunrise)[1].slice(11,13));
        let day2_sunset = parseInt((axios_response.data.daily.sunset)[1].slice(11,13));
        let next_day_data = [max_tmp_day2, min_tmp_day2, codes_day2_6_9_12_15_18_21, day2_sunrise, day2_sunset];        // the array for the next day is ready...
        let next_day_string = JSON.stringify(next_day_data);                                                            // ...and stringified
    
        let day3_tmp = tmp_arr.slice(54, 70);                               // same process for the day after tomorrow
        let day3_cod = cod_arr.slice(54, 70);
        let max_tmp_day3 = [-999, -9];
        let min_tmp_day3 = [999, -9];
        let codes_day3_6_9_12_15_18_21 = [  day3_cod[0], day3_tmp[0], day3_cod[3], day3_tmp[3],
                                            day3_cod[6], day3_tmp[6], day3_cod[9], day3_tmp[9],
                                            day3_cod[12], day3_tmp[12], day3_cod[15], day3_tmp[15]
                                        ];
        for (let i = 0; i < 16; i++){
            if (day3_tmp[i] > max_tmp_day3[0]){
                max_tmp_day3[0] = day3_tmp[i];
                max_tmp_day3[1] = i+6
            };
            if (day3_tmp[i] < min_tmp_day3[0]){
                min_tmp_day3[0] = day3_tmp[i];
                min_tmp_day3[1] = i+6
            }
        };
        let day3_sunrise = parseInt((axios_response.data.daily.sunrise)[2].slice(11,13));
        let day3_sunset = parseInt((axios_response.data.daily.sunset)[2].slice(11,13));
        let day3_data = [max_tmp_day3, min_tmp_day3, codes_day3_6_9_12_15_18_21, day3_sunrise, day3_sunset];
        let day3_string = JSON.stringify(day3_data);
        let weather_final = [next_6h_string, next_day_string, day3_string];
        let string_weather = JSON.stringify(weather_final);                 // will return the object, and, if an id is given, insert it into the DB
        if (in_id){
            let db;
            try{
                db = await openDb('getWeather');
                return new Promise ((resolve,reject) =>{
                    db.run('UPDATE tasks SET weather = ? WHERE user_id = ?', [string_weather, in_id], function(err) {
                        if (err) { console.log('>>> GtW >1>', err.message);
                            resolve([false,db])
                        } else{ console.log(`WEATHER COLUMN UPDATED IN THE DB - Row(s) updated >>> GtW >2>: ${this.changes}`);
                            resolve([string_weather,db])
                        }
                    })
                })
            } catch (err){
                console.log('Error while openDb(getWeather)', err.message);
                if (db){ closeDb(db, 'getWeather');
                }
                return([string_weather, false])
            }
        } else{ return(string_weather)
        }
    }catch (err){ console.log('Error while axios.get(string_to_axios, {timeout : 2000}):', err.message);
        return [false,false]
    }
};

async function registerUser(in_username, in_hash, in_first_name, in_time_place_obj){
    try{
        let new_id = await db.query(
            'INSERT INTO credential(username, password) VALUES ($1, $2) RETURNING id;', [in_username, in_hash]
        );
        await db.query(
            'INSERT INTO account(user_id, username, first_name, first_pw, creation) VALUES ($1, $2, $3, $4, $5);',
            [((new_id.rows[0]).id), in_username, in_first_name, in_hash, in_time_place_obj['timestamp']]
        );
        let weather_str;
        try{
            weather_str = await getWeather(in_time_place_obj['lat'], in_time_place_obj['lon'], in_time_place_obj['tmz_iana'], in_time_place_obj['local_hour']);
        } catch{
            console.log('getWeather() did not return a value for user', in_username + '. Will insert empty array instead')
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
    } catch(err){
        console.log('ERROR in registerUser():', err.code, ':', err.message);
        return res.redirect('/login')
    }
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
    let cred_arr = JSON.parse(req.body.cred_arr_str);
    let time_lace_obj = JSON.parse(req.body.time_place_obj_str);
    let first_name = req.body.first_name
    bcrypt.hash( ( (cred_arr[1])+(process.env.PEP) ), saltRounds, async function(err, hash) {
        await registerUser( cred_arr[0], hash, first_name, time_lace_obj )
    });
});

app.listen(3000, function(){
    console.log("listening on port 3000");
});