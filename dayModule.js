function getWeekday(in_str){
    if      (in_str == "Sun"){ return 0 }
    else if (in_str == "Mon"){ return 1 }
    else if (in_str == "Tue"){ return 2 }
    else if (in_str == "Wed"){ return 3 }
    else if (in_str == "Thu"){ return 4 }
    else if (in_str == "Fri"){ return 5 }
    else if (in_str == "Sat"){ return 6 }
    else return false
};

module.exports = {

    "dayA" : function( in_tmz_iana, input_timestamp = Date.now() ){
        const new_date = new Date(input_timestamp);
        const options = {
            timeZone: in_tmz_iana,
            year: "numeric", month:"numeric", day:"numeric",
            weekday: "short"
        };
        const date_str = new_date.toLocaleString('en-US', options); // "Mon, 11/27/2023" "Wed, 1/5/2022"
        let year = month = day = "";
        let slashes = 0;
        for (let a = 5; a < date_str.length; a++){
            if (date_str[a] != "/"){
                if(slashes){
                    if(slashes == 1){ day += date_str[a] }
                    else{ year += date_str[a] }
                } else{ month += date_str[a] }
            } else{ slashes += 1 }
        };
        if (month.length == 1){ month = "0" + month };
        if (day.length == 1){ day = "0" + day };
        return {
            "YYYY-MM-DD": year +'-'+ month +'-'+ day,
            "weekday" : getWeekday(date_str.slice(0,3)),
            "day" : day
        }
    },

    "dayB" : function( in_tmz_iana, input_timestamp = Date.now() ){
        const new_date = new Date(input_timestamp + 86400000);
        const options = {
            timeZone: in_tmz_iana,
            year: "numeric", month:"numeric", day:"numeric",
            weekday: "short"
        };
        const date_str = new_date.toLocaleString('en-US', options); // "Mon, 11/27/2023" "Wed, 1/5/2022"
        let year = month = day = "";
        let slashes = 0;
        for (let a = 5; a < date_str.length; a++){
            if (date_str[a] != "/"){
                if(slashes){
                    if(slashes == 1){ day += date_str[a] }
                    else{ year += date_str[a] }
                } else{ month += date_str[a] }
            } else{ slashes += 1 }
        };
        if (month.length == 1){ month = "0" + month };
        if (day.length == 1){ day = "0" + day };
        return {
            "YYYY-MM-DD": year +'-'+ month +'-'+ day,
            "weekday" : getWeekday(date_str.slice(0,3)),
            "day" : day
        }
    },

    "dayC" : function( in_tmz_iana, input_timestamp = Date.now() ){
        const new_date = new Date(input_timestamp + 172800000);
        const options = {
            timeZone: in_tmz_iana,
            year: "numeric", month:"numeric", day:"numeric",
            weekday: "short"
        };
        const date_str = new_date.toLocaleString('en-US', options); // "Mon, 11/27/2023" "Wed, 1/5/2022"
        let year = month = day = "";
        let slashes = 0;
        for (let a = 5; a < date_str.length; a++){
            if (date_str[a] != "/"){
                if(slashes){
                    if(slashes == 1){ day += date_str[a] }
                    else{ year += date_str[a] }
                } else{ month += date_str[a] }
            } else{ slashes += 1 }
        };
        if (month.length == 1){ month = "0" + month };
        if (day.length == 1){ day = "0" + day };
        return {
            "YYYY-MM-DD": year +'-'+ month +'-'+ day,
            "weekday" : getWeekday(date_str.slice(0,3)),
            "day" : day
        }
    },

    "dayA_pretty" : function(input_timestamp = Date.now()){
        let dayObj = new Date(input_timestamp);
        const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
        return dayObj.toLocaleDateString("en-US", options);
    },

    "dayB_pretty" : function(input_timestamp = Date.now()){
        let dayObj = new Date(input_timestamp + 86400000);
        const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
        return dayObj.toLocaleDateString("en-US", options);
    },

    "dayC_pretty" : function(input_timestamp = Date.now()){
        let dayObj = new Date(input_timestamp + 172800000);
        const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
        return dayObj.toLocaleDateString("en-US", options);
    },

    "dayA_short" : function(input_timestamp = Date.now()){
        let dayObj = new Date(input_timestamp);
        const options = { weekday: "short", year: "numeric", month: "numeric", day: "numeric" };
        return dayObj.toLocaleDateString("en-US", options);
    }
}
