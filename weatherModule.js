
const axios = require("axios");

module.exports = async function (in_lat, in_lon, in_tmz_iana, in_hour, in_cel = true) {
    console.log('axios entered with:', in_lat, in_lon, in_tmz_iana, in_hour, in_cel)
        if (in_cel){ in_cel = "" }
        else{ in_cel = "temperature_unit=fahrenheit&" };

        let string_to_axios = `https://api.open-meteo.com/v1/forecast?latitude=${in_lat}&longitude=${in_lon}&hourly=temperature_2m,weathercode&${in_cel}daily=sunrise,sunset&timezone=${in_tmz_iana}&forecast_days=3`
        console.log(string_to_axios);
        try{
            let axios_response = await axios.get(string_to_axios, {timeout : 3000})
            let hour_arr = axios_response.data.hourly.time;
            let tmp_arr = axios_response.data.hourly.temperature_2m;
            let cod_arr = axios_response.data.hourly.weathercode;
            let daily_info = axios_response.data.daily;
            
            const today_arr = [], tomorrow_arr = [], day3_arr = [];
            in_hour = parseInt(in_hour);
            let max_temp_1 = -999;  let max_temp_2 = -999;  let max_temp_3 = -999;
            let min_temp_1 = 999;   let min_temp_2 = 999;   let min_temp_3 = 999;
            let max_hr_1, max_hr_2, max_hr_3, min_hr_1, min_hr_2, min_hr_3;
            for (let i = 0; i < 72; i++){
                if (i < 24) {
                    if (5 < i && i < 22){
                        if (tmp_arr[i] > max_temp_1){
                            max_temp_1 = Math.round(tmp_arr[i]);
                            max_hr_1 = hour_arr[i].slice(11,13)
                        };
                        if (tmp_arr[i] < min_temp_1){
                            min_temp_1 = Math.round(tmp_arr[i]);
                            min_hr_1 = hour_arr[i].slice(11,13)
                        };
                    };
                    today_arr.push([hour_arr[i].slice(11,13), Math.round(tmp_arr[i]), cod_arr[i]])
                } else if (i < 48) {
                    if (29 < i && i < 46){
                        if (tmp_arr[i] > max_temp_2){
                            max_temp_2 = Math.round(tmp_arr[i]);
                            max_hr_2 = hour_arr[i].slice(11,13)
                        };
                        if (tmp_arr[i] < min_temp_2){
                            min_temp_2 = Math.round(tmp_arr[i]);
                            min_hr_2 = hour_arr[i].slice(11,13)
                        };
                    };
                    tomorrow_arr.push([hour_arr[i].slice(11,13), Math.round(tmp_arr[i]), cod_arr[i]])
                } else {
                    if (53 < i && i < 70){
                        if (tmp_arr[i] > max_temp_3){
                            max_temp_3 = Math.round(tmp_arr[i]);
                            max_hr_3 = hour_arr[i].slice(11,13)
                        };
                        if (tmp_arr[i] < min_temp_3){
                            min_temp_3 = Math.round(tmp_arr[i]);
                            min_hr_3 = hour_arr[i].slice(11,13)
                        };
                    };
                    day3_arr.push([hour_arr[i].slice(11,13), Math.round(tmp_arr[i]), cod_arr[i]])
                }
            };
            const today_key =       daily_info.time[0];
            const tomorrow_key =    daily_info.time[1];
            const day3_key =        daily_info.time[2];
            const forecast = {
                [today_key]: {
                    'hr_tmp_code': today_arr,
                    'max': [max_hr_1, max_temp_1],
                    'min': [min_hr_1, min_temp_1],
                    'sunrise': parseInt(daily_info.sunrise[0].slice(11,13)),
                    'sunset': parseInt(daily_info.sunset[0].slice(11,13)),
                },
                [tomorrow_key]: {
                    'hr_tmp_code': tomorrow_arr,
                    'max': [max_hr_2, max_temp_2],
                    'min': [min_hr_2, min_temp_2],
                    'sunrise': parseInt(daily_info.sunrise[1].slice(11,13)),
                    'sunset': parseInt(daily_info.sunset[1].slice(11,13)),
                },
                [day3_key]: {
                    'hr_tmp_code': day3_arr,
                    'max': [max_hr_3, max_temp_3],
                    'min': [min_hr_3, min_temp_3],
                    'sunrise': parseInt(daily_info.sunrise[2].slice(11,13)),
                    'sunset': parseInt(daily_info.sunset[2].slice(11,13)),
                }
            };
            return JSON.stringify(forecast)

        }catch (err){ console.log('ERROR while axios.get():', err.message);
            return false
        }
    }