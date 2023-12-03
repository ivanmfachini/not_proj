;$(function(){

$('.auxiliar_note').hide();
$("#realname").hide();
$("#password-confirm").hide();

const hour_offset = parseInt(((new Date()).getTimezoneOffset())/60); console.log(hour_offset);
let tmz_suffix = "T00:00:00.000";
if (hour_offset > -1){
    if (hour_offset > 9){   tmz_suffix += "-" + hour_offset.toString() + ":00" }
    else{                   tmz_suffix += "-0" +hour_offset.toString() + ":00" }
} else{
    if (hour_offset < -9){  tmz_suffix += "+" + hour_offset.toString() + ":00" }
    else{                   tmz_suffix += "+0" +hour_offset.toString() + ":00" }
}; console.log(tmz_suffix);

const tmz_iana = Intl.DateTimeFormat().resolvedOptions().timeZone; console.log(tmz_iana);
let lat = -27.59;
let lon = -48.45;
navigator.geolocation.getCurrentPosition(position => {
    lat = parseFloat((position.coords.latitude).toFixed(2));
    lon = parseFloat((position.coords.longitude).toFixed(2)); console.log(lat, lon);
});

let new_date;

function YYYYMMDD(in_date){
    const options = {
        timeZone: tmz_iana,
        year: "numeric", month:"numeric", day:"numeric",
        weekday: "short"
    };
    const date_str = in_date.toLocaleString('en-US', options); // "Mon, 11/27/2023" "Wed, 1/5/2022"
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
    return(year +'-'+ month +'-'+ day)
};

function usernameChecker(in_str){
    if (typeof(in_str) != "string" || in_str == "undefined" || in_str == "NaN" ||
        in_str == "null" || in_str == "false" || in_str == "true" ){ return false };
    if (in_str.length > 3 && in_str.length < 40){
        for (let i = 0; i < in_str.length; i++) {
            let code = in_str.charCodeAt(i);
            if ((code < 48 || (code > 57 && code < 65) || (code > 90 && code < 95) || code == 96 || code > 122)) {
                return false;
            }
        }
        return true
    }
    return false
};

function realnameChecker(in_str){
    if (in_str.length > 1 && in_str.length < 40){
        for (let i = 0; i < in_str.length; i++) {
            let code = in_str.charCodeAt(i);
            if ( ( code < 32 || (code > 32 && code < 48) || (code > 57 && code < 65) || (code > 90 && code < 95) || code == 96 || code > 122) ) {
                return false;
            }
        }
        return true
    }
    return false
};

function inputChecker(in_str){
    if (in_str.length > 4 && in_str.length < 40){
        for (let i = 0; i < in_str.length; i++) {
            let code = in_str.charCodeAt(i);
            if ( code < 33 || code == 34 || code == 39 || code == 40 || code == 41 || code == 47 || code == 123 || code == 125 ) {
                return false;
            }
        }
        return true
    }
    return false
};


function login(in_obj = false){
    $(in_obj).css('background-color', 'rgb(5,10,40)');

    if ( usernameChecker($("#username").val()) ){
        if ( inputChecker($("#password").val()) ){
            new_date = new Date();
            $("#login-form").append("<input hidden type='text' name='time_place_obj_str' value='" + (
                JSON.stringify({
                    'YYYY-MM-DD' : YYYYMMDD(new_date),
                    'local_hour': new_date.getHours(),
                    'UTC_hour': new_date.getUTCHours(),
                    'timestamp': new_date.getTime(),
                    'lat':lat,
                    'lon':lon,
                    'tmz_iana': tmz_iana,
                    'hour_offset': hour_offset,
                    'tmz_suffix': tmz_suffix
                })
            ) + "'/>");
            $("#login-form").append("<input hidden type='text' name='cred_arr_str' value='" + (
                JSON.stringify([ $("#username").val(), $("#password").val() ])
            ) + "'/>");
            document.getElementById("login-form").submit();
        } else{
            alert('Password not submitted')
        }
    } else{
        alert('Username not submitted')
    }
};
$("#login").on('mousedown', function(){
    login(this)
});

window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
        return // Do nothing if the event was already processed
    }
    switch (event.key) {
        case "Enter": login(); break;
        default: return
    }
    event.preventDefault();
});

$("#register").on('mousedown', function(){
    $(this).css('background-color', 'rgb(22,5,30)');
});
$("#register").on('mouseup', function(){
    $(this).css('background-color', 'rgb(44,10,60)');
});
$("#why_location").on('click', function(){
    $(this).html('<p>This page handles a non-accurate location to provide the weather forecast, via <a href="https://open-meteo.com/">open-meteo</a> API.</p><div style="height: 7px;"></div><p>While denied, location will be set to <a href="https://maps.app.goo.gl/zmtwBBPgaWNpKumn6">Florianópolis, SC, Brazil</a></p>');
});
let click_time = 0;
$("#register").on('click', function(){
    $("#realname").show(60);
    $("#password-confirm").show(60);
    click_time += 1;
    let checker = 0;
    if ($("#username").val() == "" && click_time > 1){
        $("#username_required").css('top','112px');
        $("#username_required").css('left','230px');
        $("#username_required").fadeIn();
        setTimeout(()=>{
            $("#username_required").fadeOut();
        },3000);
        return
    };
    if ($("#realname").val() == "" && click_time > 1){
        $("#rn_required").css('top','158px');
        $("#rn_required").css('left','230px');
        $("#rn_required").fadeIn();
        setTimeout(()=>{
            $("#rn_required").fadeOut();
        },3000);
        return
    };
    if ($("#password").val() == "" && click_time > 1){
        $("#pw_required").css('top','206px');
        $("#pw_required").css('left','230px');
        $("#pw_required").fadeIn();
        setTimeout(()=>{
            $("#pw_required").fadeOut();
        },3000);
        return
    };        
    if (usernameChecker($("#username").val())){
        checker += 1
    } else if (click_time > 1){
        $("#username_forbidden").css('top','112px');
        $("#username_forbidden").css('left','230px');
        $("#username_forbidden").fadeIn();
        setTimeout(()=>{
            $("#username_forbidden").fadeOut();
        },4500);
        return
    };
    if (realnameChecker($("#realname").val())){
        checker += 1
    } else if (click_time > 1){
        $("#realname_forbidden").css('top','158px');
        $("#realname_forbidden").css('left','230px');
        $("#realname_forbidden").fadeIn();
        setTimeout(()=>{
            $("#realname_forbidden").fadeOut();
        },4500);
        return
    };
    if (inputChecker($("#password").val())){
        checker += 1
    } else if (click_time > 1){
        $("#pw_small").css('top','222px');
        $("#pw_small").css('left','230px');
        $("#pw_small").fadeIn();
        setTimeout(()=>{
            $("#pw_small").fadeOut();
        },4500);
        return
    };
    if ($("#password").val() == $("#password-confirm").val()){
        checker += 1
    } else if (click_time > 1){
        $("#pw_not_match").css('top','222px');
        $("#pw_not_match").css('left','230px');
        $("#pw_not_match").fadeIn();
        setTimeout(()=>{
            $("#pw_not_match").fadeOut();
        },4500);
        return
    };
    if (checker == 4){
        new_date = new Date();
        $("#register-form").append("<input hidden type='text' name='time_place_obj_str' value='" + (
            JSON.stringify({
                'YYYY-MM-DD' : YYYYMMDD(new_date),
                'local_hour': new_date.getHours(),
                'UTC_hour': new_date.getUTCHours(),
                'timestamp': new_date.getTime(),
                'lat':lat,
                'lon':lon,
                'tmz_iana': tmz_iana,
                'hour_offset': hour_offset,
                'tmz_suffix': tmz_suffix
            })
        ) + "'/>");
        $("#register-form").append("<input hidden type='text' name='cred_arr_str' value='" + (
            JSON.stringify([ $("#username").val(), $("#password").val() ])
        ) + "'/>");
        $("#register-form").append("<input hidden type='text' name='first_name' value='" + $("#realname").val() + "'/>");
        document.getElementById("register-form").submit();
    } else{ return
    }
});

$("#pw_change").on('click',function(){
    $(this).css('background-color', 'rgb(22,5,30)');
    let checker = 0;
    if ($("#username2").val() == ""){
        $("#username_required").css('top','190px');
        $("#username_required").css('left','230px');
        $("#username_required").fadeIn();
        setTimeout(()=>{
            $("#username_required").fadeOut();
        },3000);
        return
    };
    if ($("#old_pw").val() == ""){
        $("#pw_required").css('top','230px');
        $("#pw_required").css('left','230px');
        $("#pw_required").fadeIn();
        setTimeout(()=>{
            $("#pw_required").fadeOut();
        },3000);
        return
    };
    if (usernameChecker($("#username2").val())){
        checker += 1
    } else{
        $("#username_forbidden").css('top','175px');
        $("#username_forbidden").css('left','230px');
        $("#username_forbidden").fadeIn();
        setTimeout(()=>{
            $("#username_forbidden").fadeOut();
        },4500);
        return
    };
    if (inputChecker($("#new_pw").val())){
        checker += 1
    } else{
        $("#pw_small").css('top','250px');
        $("#pw_small").css('left','230px');
        $("#pw_small").fadeIn();
        setTimeout(()=>{
            $("#pw_small").fadeOut();
        },4500);
        return
    };
    if ($("#new_pw").val() == $("#new_pw_confirm").val()){
        checker += 1
    } else{
        $("#pw_not_match").css('top','300px');
        $("#pw_not_match").css('left','230px');
        $("#pw_not_match").fadeIn();
        setTimeout(()=>{
            $("#pw_not_match").fadeOut();
        },4500);
        return
    }
    if (checker == 3){
        let string_to_submit = JSON.stringify([$("#username2").val(), $("#old_pw").val(), $("#new_pw").val()]);
        $("#change_pw-form").append("<input hidden type='text' name='change_pw_array' value='" + string_to_submit + "'/>");
        string_to_submit = "";
        document.getElementById("change_pw-form").submit();
    }
});

$("#demo").on('mousedown', () =>{
    $(this).css('background-position','100% 0');
    $(this).css('-o-transition','all .3s ease-in-out');
    $(this).css('-webkit-transition','all .3s ease-in-out');
    $(this).css('transition','all .3s ease-in-out');

    new_date = new Date();
    const time_place_obj_str = JSON.stringify({
        'YYYY-MM-DD' : YYYYMMDD(new_date),
        'local_hour': new_date.getHours(),
        'UTC_hour': new_date.getUTCHours(),
        'timestamp': new_date.getTime(),
        'lat':lat,
        'lon':lon,
        'tmz_iana': tmz_iana,
        'hour_offset': hour_offset,
        'tmz_suffix': tmz_suffix
    });
    $("#demo-form").append("<input hidden type='text' name='time_place_obj_str' value='" + time_place_obj_str + "'/>");
    string_to_submit = "";
    document.getElementById("demo-form").submit();

})
});