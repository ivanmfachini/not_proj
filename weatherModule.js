
const axios = require("axios");

module.exports = async function (in_lat, in_lon, in_tmz_iana, in_hour, in_cel = true) {
        if (in_cel){
            in_cel = "";
        } else{
            in_cel = "temperature_unit=fahrenheit&";                            // in_cel is taken from the TASKS TABLE. If it is 1, converts to an empty string, since the open-meteo API returns in ºC by default.
        }                                                                       // To return the temperatures in ºF, the API requires a modifier, which is given if in_cel == 0.
        let string_to_axios = `https://api.open-meteo.com/v1/forecast?latitude=${in_lat}&longitude=${in_lon}&hourly=temperature_2m,weathercode&${in_cel}daily=sunrise,sunset&timezone=${in_tmz_iana}&forecast_days=3`
        try{
            let axios_response = await axios.get(string_to_axios, {timeout : 3000})
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
            let next_6h_string = JSON.stringify([next_6h_hrs, next_6h_cod, next_6h_tmp, day1_sunrise, day1_sunset]);      // the array for the next 6h is ready...
        
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
            let next_day_string = JSON.stringify([max_tmp_day2, min_tmp_day2, codes_day2_6_9_12_15_18_21, day2_sunrise, day2_sunset]);        // the array for the next day is ready...
        
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
            let day3_string = JSON.stringify([max_tmp_day3, min_tmp_day3, codes_day3_6_9_12_15_18_21, day3_sunrise, day3_sunset]);
            let string_weather = JSON.stringify([next_6h_string, next_day_string, day3_string]);

            return(string_weather)

        }catch (err){ console.log('ERROR while axios.get():', err.message);
            return false
        }
    }