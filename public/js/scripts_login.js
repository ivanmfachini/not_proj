;$(function(){      // document ready, https://stackoverflow.com/a/4584475/21113444

    $('.auxiliar_note').hide();
    const TIMEZONESYMBOL = Intl.DateTimeFormat().resolvedOptions().timeZone;
    console.log('TIMEZONESYMBOL:', TIMEZONESYMBOL);
    let current_hour = new Date().getHours();
    let buf_str_TIMEZONE, buf_GMT;
    const TIMEZONES_NAMES = {   "+8" : "America/Anchorage", "+7" : "America/Los_Angeles",   "+6" : "America/Denver",
                                "+5" : "America/Chicago",   "+4" : "America/New_York",      "+3" : "America/Sao_Paulo",
                                "-1" : "Europe/London",     "-2" : "Europe/Berlin",         "-3" : "Europe/Moscow",
                                "-7" : "Asia/Bangkok",      "-8" : "Asia/Singapore",        "-9" : "Asia/Tokyo",
                                "-11": "Australia/Sydney",  "-13": "Pacific/Auckland",      "0"  : "GMT+0",
                                "-0" : "GMT+0",             "-0" : "GMT+0"
                            };

    for (let i = 2; i < TIMEZONESYMBOL.length; i++){
        if (TIMEZONESYMBOL[i] == "+"){
            if (TIMEZONESYMBOL[i+2]){
                let buf_nr1 = TIMEZONESYMBOL[i+1].toString();
                let buf_nr2 = TIMEZONESYMBOL[i+2].toString();
                buf_GMT = "+"+buf_nr1+buf_nr2;
                buf_str_TIMEZONE = "T00:00:00.000-" + buf_nr1 + buf_nr2 + ":00";
                console.log('buf_str_TIMEZONE:', buf_str_TIMEZONE);
                break
            } else{
                let buf_nr1 = TIMEZONESYMBOL[i+1].toString();
                buf_GMT = "+"+buf_nr1;
                buf_str_TIMEZONE = "T00:00:00.000-0" + buf_nr1 + ":00";
                console.log('buf_str_TIMEZONE:', buf_str_TIMEZONE);
                break
            }
        } else if (TIMEZONESYMBOL[i] == "-"){
            if (TIMEZONESYMBOL[i+2]){
                let buf_nr1 = TIMEZONESYMBOL[i+1].toString();
                let buf_nr2 = TIMEZONESYMBOL[i+2].toString();
                buf_GMT = "-"+buf_nr1+buf_nr2;
                buf_str_TIMEZONE = "T00:00:00.000+" + buf_nr1 + buf_nr2 + ":00";
                console.log('buf_str_TIMEZONE:', buf_str_TIMEZONE);
                break
            } else{
                let buf_nr1 = TIMEZONESYMBOL[i+1].toString();
                buf_GMT = "-"+buf_nr1;
                buf_str_TIMEZONE = "T00:00:00.000+0" + buf_nr1 + ":00";
                console.log('buf_str_TIMEZONE:', buf_str_TIMEZONE);
                break
            }
        }
    };

    const TIMEZONE = buf_str_TIMEZONE;          console.log('TIMEZONE:', TIMEZONE);
    let GMT = buf_GMT;                          console.log('GMT (1):', GMT);
    const GMT_NAME = TIMEZONES_NAMES[GMT];      console.log('GMT_NAME:', GMT_NAME);
    GMT = parseInt((-1*GMT));                   console.log('GMT (2):', GMT);
    let user_lat, user_lon;
    const options_location = {
        enableHighAccuracy: false,
        timeout: 3500,
        maximumAge: 604800000
    };
    function success(pos) {
        const crd  = pos.coords;
        user_lat = (crd.latitude).toFixed(2);
        user_lon = (crd.longitude).toFixed(2);
        console.log('user_lat:', user_lat);
        console.log('user_lon:', user_lon);
    };
    function error(err) {
        console.log(`ERROR(${err.code}): ${err.message}`);
        user_lat = -27.6;
        user_lon = -48.5
    };
    //navigator.geolocation.register_getCurrentPosition(success, error, options_location);

    navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        console.log(position.coords)
      });

    function usernameChecker(in_str){
        if (in_str.length > 2 && in_str.length < 40){
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

    $("#realname").hide();
    $("#password-confirm").hide();

    function login(in_obj = false){
        $(in_obj).css('background-color', 'rgb(5,10,40)');

        if ( usernameChecker($("#username").val()) ){
            if ( inputChecker($("#password").val()) ){
                let string_to_submit;
                if (!user_lat){
                    string_to_submit = JSON.stringify([$("#username").val(), $("#password").val(), TIMEZONE, GMT_NAME, current_hour, -27.6, -48.5, Date.now(), GMT]);
                } else{
                    string_to_submit = JSON.stringify([$("#username").val(), $("#password").val(), TIMEZONE, GMT_NAME, current_hour, user_lat, user_lon, Date.now(), GMT]);
                }
                $("#login-form").append("<input hidden type='text' name='login_array' value='" + string_to_submit + "'/>");
                string_to_submit = "";
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
            let string_to_submit = JSON.stringify([$("#username").val(), $("#password").val(), $("#realname").val()]);
            $("#register-form").append("<input hidden type='text' name='register_array' value='" + string_to_submit + "'/>");
            let string_to_submit2;
            if (!user_lat){
                string_to_submit2 = JSON.stringify([$("#username").val(), $("#password").val(), TIMEZONE, GMT_NAME, current_hour, -27.6, -48.5, Date.now(), GMT]);
            } else{
                string_to_submit2 = JSON.stringify([$("#username").val(), $("#password").val(), TIMEZONE, GMT_NAME, current_hour, user_lat, user_lon, Date.now(), GMT]);
            }
            $("#register-form").append("<input hidden type='text' name='login_array' value='" + string_to_submit2 + "'/>");
            string_to_submit = string_to_submit2 = "";
            document.getElementById("register-form").submit();
        } else{ return }
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

        let string_to_submit;
        if (!user_lat){
            string_to_submit = JSON.stringify([$("#username").val(), $("#password").val(), TIMEZONE, GMT_NAME, current_hour, -27.6, -48.5, Date.now(), GMT]);
        } else{
            string_to_submit = JSON.stringify([$("#username").val(), $("#password").val(), TIMEZONE, GMT_NAME, current_hour, user_lat, user_lon, Date.now(), GMT]);
        }
        $("#demo-form").append("<input hidden type='text' name='login_array' value='" + string_to_submit + "'/>");
        string_to_submit = "";
        document.getElementById("demo-form").submit();

    })
});