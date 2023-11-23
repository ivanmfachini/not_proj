module.exports = {

    "dayA" : function( input_timestamp = Date.now() ){
        let dayObj = new Date(input_timestamp);
        let weekday = dayObj.getDay();
        let day = dayObj.getDate();
        if (day < 10){
            day = "0" + day.toString()
        } else{
            day = day.toString()
        }
        let month = (dayObj.getMonth() + 1).toString();
        if (month.length < 2){
            month = "0" + month
        };
        return JSON.stringify({"YYYY-MM-DD" : ((dayObj.getFullYear()).toString())+'-'+month+'-'+day, "weekday" : weekday, "day" : day})
    },

    "dayB" : function( input_timestamp = Date.now() ){
        let dayObj = new Date(input_timestamp + 86400000);
        let weekday = dayObj.getDay();
        let day = dayObj.getDate();
        if (day < 10){
            day = "0" + day.toString()
        } else{
            day = day.toString()
        }
        let month = (dayObj.getMonth() + 1).toString();
        if (month.length < 2){
            month = "0" + month
        };
        return JSON.stringify({"YYYY-MM-DD" : ((dayObj.getFullYear()).toString())+'-'+month+'-'+day, "weekday" : weekday, "day" : day})
    },

    "dayC" : function( input_timestamp = Date.now() ){
        let dayObj = new Date(input_timestamp + 172800000);
        let weekday = dayObj.getDay();
        let day = dayObj.getDate();
        if (day < 10){
            day = "0" + day.toString()
        } else{
            day = day.toString()
        }
        let month = (dayObj.getMonth() + 1).toString();
        if (month.length < 2){
            month = "0" + month
        };
        return JSON.stringify({"YYYY-MM-DD" : ((dayObj.getFullYear()).toString())+'-'+month+'-'+day, "weekday" : weekday, "day" : day})
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
