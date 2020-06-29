var net = require('net');
var request = require('request');
var express = require('express');
var bodyParser  = require('body-parser');
var sshClient = require('ssh2').Client;
var tls = require('tls');
var Server = require('node-ssdp').Server;
var ip = require('ip');
var fs = require('fs');
var cmd = require('node-cmd');
var CronJob = require('cron').CronJob;
var forge = require('node-forge');
var URLSearchParams = require('url-search-params');

var accessToken;
var smartbridgeIP;
var jsonKey;
var client;
var appCert;
var localCert;
var haveCerts = false;
var callback;
var authenticityToken;
var cookie;

// const CLIENT_ID = "e001a4471eb6152b7b3f35e549905fd8589dfcf57eb680b6fb37f20878c28e5a";
// const CLIENT_SECRET = "b07fee362538d6df3b129dc3026a72d27e1005a3d1e5839eed5ed18c63a89b27";
const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

var appTelnetClient;
var appSSLClient;
var app = express();
app.use(bodyParser.json());
var isConnect = false;

var exports = module.exports = {};

var lutronBridges = [];
var SMARTBRIDGE_IP;
var SMARTTHINGS_IP;
var buttonMethods;
var shortPressTime;
var intervalTime;
var keys;
var code;
var user;
var pw;


function initalize(ip, cb) {
	smartbridgeIP = ip;
	callback = cb;
	console.log('**********************************************');
	console.log('callback', callback)
	console.log('**********************************************');
	fs.stat('appCert', function(err, stats) {
		if (!err) {
			console.log('appCert exists! YEAH!!'); 
                        console.log('IP', ip);
			haveCerts = true;
			callback();
		} else {
			console.log('No certs will attempt to generate them')

			forge.pki.rsa.generateKeyPair(2048, function(error, keypair) {
			   console.log('keys callback');
			   var pem = forge.pki.privateKeyToPem(keypair.privateKey);
			   console.log(pem);
			   fs.writeFileSync("privateKey", pem);
			   keys = keypair;
			   //getCSR();
			   startCodeFetch()
			});
			
		}
	});
}

function startCodeFetch() {
	request.get({
		  headers: {'content-type' : 'application/x-www-form-urlencoded'},
		  followAllRedirects: false,
		  url:     'https://device-login.lutron.com/users/sign_in',
		}, function(error, response, body){
		  var s = body.indexOf('name="authenticity_token" value="');
		  authenticityToken = body.substr(s + 33, 100).split('"')[0].trim();
		  cookie = response.headers['set-cookie'][0].trim();
		  console.log(authenticityToken);
		  callSignIn();
	});
}


function callSignIn() {
	//console.log('Post called');
	var paramsObject = {utf8: "✓", authenticity_token: authenticityToken, 'user[email]': user, 'user[password]': pw, commit: "Sign In"};
	var params = new URLSearchParams(paramsObject).toString();
	console.log(params);
	request.post({
		headers: {'content-type' : 'application/x-www-form-urlencoded', 'Cookie': cookie},
		url:     'https://device-login.lutron.com/users/sign_in?' + params,                 
		body: "",
		}, function(error, response, body) {
			cookie = response.headers['set-cookie'][0].trim();
			console.log(authenticityToken);
			getCode();
	});
}

function getCode() {
	console.log('Get called');
	request.get({
		headers: {'Cookie' : cookie},
		url:     'https://device-login.lutron.com/oauth/authorize?redirect_uri=' + encodeURI(REDIRECT_URI) + '&client_id=' + encodeURI(CLIENT_ID) +  '&response_type=code',
		followAllRedirects: true,
		}, function(error, response, body) {
			  console.log(authenticityToken);
			  var s = body.indexOf('authorization_code');
			  console.log(s);
			  if(s == -1) {
				  console.log('no code, try again');
			  } else {
				code = body.substr(s + 20, 80).split('<')[0];
				console.log('the code is ' + code);
				//console.log(body);
				cookie = response.headers['set-cookie'][0].trim();
				getCSR();
			  }
	});
}

function getCSR() {
	console.log('in get CSR')
	var csr = forge.pki.createCertificationRequest();

	// fill the required fields
	csr.publicKey = keys.publicKey;

	// use your own attributes here, or supply a csr (check the docs)
	var attrs = [{
	  shortName: 'CN',
	  value: 'Lutron Caseta App'
	}, {
	  shortName: 'C',
	  value: 'US'
	}, {
	  shortName: 'ST',
	  value: 'Pennsylvania'
	}, {
	  shortName: 'L',
	  value: 'Coopersburg'
	}, {
	  shortName: 'O',
	  value: 'Lutron Electronics Co., Inc.'
	}];

	// here we set subject and issuer as the same one
	csr.setSubject(attrs);
		
	// the actual certificate signing
	csr.sign(keys.privateKey);
    console.log(csr);
	var verified = csr.verify();
	// now convert the Forge certificate to PEM format
	var pem = forge.pki.certificationRequestToPem(csr);
	console.log(pem);
	
	var strippedPem = pem.replace(/\r/g, "");
	jsonKey = {"remote_signs_app_certificate_signing_request" : strippedPem};
	console.log(JSON.stringify(jsonKey));
	getAccessToken();
	
	/*
	cmd.get(
		'openssl req -new -key private.pem -out my-csr.pem -subj "/C=US/ST=Pennsylvania/L=Coopersburg/O=Lutron Electronics Co., Inc./CN=Lutron Caseta App"',
		function(err, data, stderr){
			var csr = fs.readFileSync('my-csr.pem', "utf8");
			jsonKey = {"remote_signs_app_certificate_signing_request" : csr};
			console.log(JSON.stringify(jsonKey));
			getAccessToken();
        });
	*/
}

function getAccessToken() {
	console.log('in get token');
	console.log('the code is ' + code);
	var paramsObject = {redirect_uri: REDIRECT_URI, 'client_id': CLIENT_ID, client_secret : CLIENT_SECRET, 'code': code, 'grant_type': 'authorization_code'};
	var params = new URLSearchParams(paramsObject).toString();

	request.post({
	  headers: {'content-type' : 'application/x-www-form-urlencoded', 'Cookie' : cookie},
	  url:     'https://device-login.lutron.com/oauth/token',
	  body:    params, //"code=" + code + "&client_id=e001a4471eb6152b7b3f35e549905fd8589dfcf57eb680b6fb37f20878c28e5a&client_secret=b07fee362538d6df3b129dc3026a72d27e1005a3d1e5839eed5ed18c63a89b27&redirect_uri=https%3A%2F%2Fdevice-login.lutron.com%2Flutron_app_oauth_redirect&grant_type=authorization_code"
	}, function(error, response, body){
	  var jsonObject = JSON.parse(body);
	  accessToken = jsonObject.access_token;
	  console.log(accessToken);
	  console.log(body);
	  getCerts();
	});
}

function getCerts() {
	console.log('in get certs');
	request.post({
	  headers: {'content-type' : 'application/json', 'X-DeviceType' : 'Caseta,RA2Select', 'Authorization' : 'Bearer ' + accessToken},
	  url:     'https://device-login.lutron.com/api/v1/remotepairing/application/user',
	  body:    JSON.stringify(jsonKey)
	}, function(error, response, body){
	  var jsonObject = JSON.parse(body);
	  appCert = jsonObject.remote_signs_app_certificate;
	  localCert = jsonObject.local_signs_remote_certificate;
	  console.log(appCert);
	  console.log(localCert);
	  fs.writeFileSync("appCert", JSON.stringify(appCert));
	  fs.writeFileSync("localCert", JSON.stringify(localCert));
	  /*
	  fs.writeFileSync("appCert", JSON.stringify(appCert), function(err) {  //SON.stringify(appCert, null, 2)
		if(err) {
          return console.log(err);
		}
	  });
	  fs.writeFile("localCert", JSON.stringify(localCert), function(err) {
		if(err) {
		  return console.log(err);
		}
	  });
	  */
	  haveCerts = true;
	  callback();
	});
}




//SSDP server for Service Discovery
ssdp = new Server({
    sourcePort: 1900,
	location: 'http://' + ip.address() + ':5000/status',
});
 
    ssdp.addUSN('urn:schemas-upnp-org:device:RPi_Lutron_Caseta:1');
 
    ssdp.on('advertise-alive', function (headers) {
    });
 
    ssdp.on('advertise-bye', function (headers) {
    });
    // start the server 

    process.on('exit', function(){
      ssdp.stop() // advertise shutting down and stop listening 
    })

var testData1 = '{"CommuniqueType":"ReadResponse","Header":'
var testData2 = '{"MessageBodyType":"OneLIPIdListDefinition","StatusCode":"200 OK","Url":"/server/2/id"},"Body":{"LIPIdList":{"Devices":[{"Name":"Smart Bridge","ID":1,"Buttons":[{"Name":"Test","Number":1},{"Name":"Test 2","Number":2},{"Name":"Sonos","Number":3},{"Name":"Button 4","Number":4},{"Name":"Button 5","Number":5},{"Name":"Button 6","Number":6},{"Name":"Button 7","Number":7},{"Name":"Button 8","Number":8},{"Name":"Button 9","Number":9},{"Name":"Button 10","Number":10},{"Name":"Button 11","Number":11},{"Name":"Button 12","Number":12},{"Name":"Button 13","Number":13},{"Name":"Button 14","Number":14},{"Name":"Button 15","Number":15},{"Name":"Button 16","Number":16},{"Name":"Button 17","Number":17},{"Name":"Button 18","Number":18},{"Name":"Button 19","Number":19},{"Name":"Button 20","Number":20},{"Name":"Button 21","Number":21},{"Name":"Button 22","Number":22},{"Name":"Button 23","Number":23},{"Name":"Button 24","Number":24},{"Name":"Button 25","Number":25},{"Name":"Button 26","Number":26},{"Name":"Button 27","Number":27},{"Name":"Button 28","Number":28},{"Name":"Button 29","Number":29},{"Name":"Button 30","Number":30},{"Name":"Button 31","Number":31},{"Name":"Button 32","Number":32},{"Name":"Button 33","Number":33},{"Name":"Button 34","Number":34},{"Name":"Button 35","Number":35},{"Name":"Button 36","Number":36},{"Name":"Button 37","Number":37},{"Name":"Button 38","Number":38},{"Name":"Button 39","Number":39},{"Name":"Button 40","Number":40},{"Name":"Button 41","Number":41},{"Name":"Button 42","Number":42},{"Name":"Button 43","Number":43},{"Name":"Button 44","Number":44},{"Name":"Button 45","Number":45},{"Name":"Button 46","Number":46},{"Name":"Button 47","Number":47},{"Name":"Button 48","Number":48},{"Name":"Button 49","Number":49},{"Name":"Button 50","Number":50},{"Name":"Button 51","Number":51},{"Name":"Button 52","Number":52},{"Name":"Button 53","Number":53},{"Name":"Button 54","Number":54},{"Name":"Button 55","Number":55},{"Name":"Button 56","Number":56},{"Name":"Button 57","Number":57},{"Name":"Button 58","Number":58},{"Name":"Button 59","Number":59},{"Name":"Button 60","Number":60},{"Name":"Button 61","Number":61},{"Name":"Button 62","Number":62},{"Name":"Button 63","Number":63},{"Name":"Button 64","Number":64},{"Name":"Button 65","Number":65},{"Name":"Button 66","Number":66},{"Name":"Button 67","Number":67},{"Name":"Button 68","Number":68},{"Name":"Button 69","Number":69},{"Name":"Button 70","Number":70},{"Name":"Button 71","Number":71},{"Name":"Button 72","Number":72},{"Name":"Button 73","Number":73},{"Name":"Button 74","Number":74},{"Name":"Button 75","Number":75},{"Name":"Button 76","Number":76},{"Name":"Button 77","Number":77},{"Name":"Button 78","Number":78},{"Name":"Button 79","Number":79},{"Name":"Button 80","Number":80},{"Name":"Button 81","Number":81},{"Name":"Button 82","Number":82},{"Name":"Button 83","Number":83},{"Name":"Button 84","Number":84},{"Name":"Button 85","Number":85},{"Name":"Button 86","Number":86},{"Name":"Button 87","Number":87},{"Name":"Button 88","Number":88},{"Name":"Button 89","Number":89},{"Name":"Button 90","Number":90},{"Name":"Button 91","Number":91},{"Name":"Button 92","Number":92},{"Name":"Button 93","Number":93},{"Name":"Button 94","Number":94},{"Name":"Button 95","Number":95},{"Name":"Button 96","Number":96},{"Name":"Button 97","Number":97},{"Name":"Button 98","Number":98},{"Name":"Button 99","Number":99},{"Name":"Button 100","Number":100},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test 2","Number":2},{"Name":"Sonos","Number":3},{"Name":"Button 4","Number":4},{"Name":"Button 5","Number":5},{"Name":"Button 6","Number":6},{"Name":"Button 7","Number":7},{"Name":"Button 8","Number":8},{"Name":"Button 9","Number":9},{"Name":"Button 10","Number":10},{"Name":"Button 11","Number":11},{"Name":"Button 12","Number":12},{"Name":"Button 13","Number":13},{"Name":"Button 14","Number":14},{"Name":"Button 15","Number":15},{"Name":"Button 16","Number":16},{"Name":"Button 17","Number":17},{"Name":"Button 18","Number":18},{"Name":"Button 19","Number":19},{"Name":"Button 20","Number":20},{"Name":"Button 21","Number":21},{"Name":"Button 22","Number":22},{"Name":"Button 23","Number":23},{"Name":"Button 24","Number":24},{"Name":"Button 25","Number":25},{"Name":"Button 26","Number":26},{"Name":"Button 27","Number":27},{"Name":"Button 28","Number":28},{"Name":"Button 29","Number":29},{"Name":"Button 30","Number":30},{"Name":"Button 31","Number":31},{"Name":"Button 32","Number":32},{"Name":"Button 33","Number":33},{"Name":"Button 34","Number":34},{"Name":"Button 35","Number":35},{"Name":"Button 36","Number":36},{"Name":"Button 37","Number":37},{"Name":"Button 38","Number":38},{"Name":"Button 39","Number":39},{"Name":"Button 40","Number":40},{"Name":"Button 41","Number":41},{"Name":"Button 42","Number":42},{"Name":"Button 43","Number":43},{"Name":"Button 44","Number":44},{"Name":"Button 45","Number":45},{"Name":"Button 46","Number":46},{"Name":"Button 47","Number":47},{"Name":"Button 48","Number":48},{"Name":"Button 49","Number":49},{"Name":"Button 50","Number":50},{"Name":"Button 51","Number":51},{"Name":"Button 52","Number":52},{"Name":"Button 53","Number":53},{"Name":"Button 54","Number":54},{"Name":"Button 55","Number":55},{"Name":"Button 56","Number":56},{"Name":"Button 57","Number":57},{"Name":"Button 58","Number":58},{"Name":"Button 59","Number":59},{"Name":"Button 60","Number":60},{"Name":"Button 61","Number":61},{"Name":"Button 62","Number":62},{"Name":"Button 63","Number":63},{"Name":"Button 64","Number":64},{"Name":"Button 65","Number":65},{"Name":"Button 66","Number":66},{"Name":"Button 67","Number":67},{"Name":"Button 68","Number":68},{"Name":"Button 69","Number":69},{"Name":"Button 70","Number":70},{"Name":"Button 71","Number":71},{"Name":"Button 72","Number":72},{"Name":"Button 73","Number":73},{"Name":"Button 74","Number":74},{"Name":"Button 75","Number":75},{"Name":"Button 76","Number":76},{"Name":"Button 77","Number":77},{"Name":"Button 78","Number":78},{"Name":"Button 79","Number":79},{"Name":"Button 80","Number":80},{"Name":"Button 81","Number":81},{"Name":"Button 82","Number":82},{"Name":"Button 83","Number":83},{"Name":"Button 84","Number":84},{"Name":"Button 85","Number":85},{"Name":"Button 86","Number":86},{"Name":"Button 87","Number":87},{"Name":"Button 88","Number":88},{"Name":"Button 89","Number":89},{"Name":"Button 90","Number":90},{"Name":"Button 91","Number":91},{"Name":"Button 92","Number":92},{"Name":"Button 93","Number":93},{"Name":"Button 94","Number":94},{"Name":"Button 95","Number":95},{"Name":"Button 96","Number":96},{"Name":"Button 97","Number":97},{"Name":"Button 98","Number":98},{"Name":"Button 99","Number":99},{"Name":"Button 100","Number":100},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1},{"Name":"Test","Number":1}]},{"Name":"Pico Test","ID":3,"Buttons":[{"Number":2},{"Number":3},{"Number":4},{"Number":5},{"Number":6}]}],"Zones":[{"Name":"Office","ID":2}]}}}'

function listenSSL(conn, ip, callback) {
	var bufferedData = '';
	
	conn.on('data', function (data) {
	   console.log('data in listenSSL');
	   bufferedData += data;
		  try {
			  JSON.parse(bufferedData.toString());
			  console.log("Buffered data is proper json");
			  var fullmessage = bufferedData;
			  console.log(fullmessage);
			  bufferedData = '';
			  callback(fullmessage);
		  } catch (e) {
			  console.log("json not valid, probably don't have it all yet");
			  console.log(e);
		  }
	});
}

function getLEAP(conn, callback) {
	console.log("Attempting to fetch LEAP Data");
	conn.write('{"CommuniqueType":"ReadRequest","Header":{"Url":"/device"}}\n');
}

function leapLipParser(lipData, leapData, callback) {
	var simplifyLip = [];
	//Make the Devices and Zones objects a single array
	for(var i = 0; i < lipData.Devices.length; i++) {
		simplifyLip.push(lipData.Devices[i]);
	}
	if (lipData.Zones) {
		for(var i = 0; i < lipData.Zones.length; i++) {
			simplifyLip.push(lipData.Zones[i]);
		}
	}
	//Add the LIP ID to the LEAP data 
	for(i in simplifyLip) {
		console.log(simplifyLip[i].Name);
		for(j in leapData) {
			console.log(leapData[j].Name);
			if (simplifyLip[i].Name == leapData[j].Name) {
				leapData[j]["ID"] = simplifyLip[i].ID;
				console.log(leapData[j]["ID"]);
				}
		}
		console.log(leapData);
	}
	//Check if there is a discrepancy between LEAP and LIP ID's and notify the user if there is
	for(j in leapData) {
		if (leapData[j]["ID"] != parseInt(leapData[j].href.substring(8))) {
			console.log(leapData[j].Name);
			console.log("The device ID's for leap and lip servers do not match! This might cause problems for you.");
		}
	}
	callback(leapData);
}

var start;
var timer;
var interval;

function telnetHandler(telnetClient, ip, callback) {

	telnetClient.on('data', function(data) {

		var elapsed;
		var button;
		var message
		var buttonAction;
		var remote;

	   console.log('Received: ' + data);
	   if (data.toString().indexOf('login') !== -1) {
		  telnetClient.write('lutron\r\n');
	  } else if (data.toString().indexOf('password') !== -1) {
			telnetClient.write('integration\r\n');
	  } else if (isConnect == false && data.toString().indexOf('GNET>') !== -1) {
		  isConnect = true;
		  console.log("Connected!")
	  } else if (data.toString().indexOf('~OUTPUT') !== -1) {
		  console.log('Device update recieved\n likely a manual change');
		  
		  message = data.toString().split(',');
		  var buttonLevel = message[3].split('.')[0];
		  var myJSONObject = {device: message[1], level: buttonLevel};
		  callback(myJSONObject);
	  } else if (data.toString().indexOf('~DEVICE') !== -1) {
		  
		  message = data.toString().split(',');
		  remote = parseInt(message[1]);
		  output = "#OUTPUT," + "2" + ",1," + "100" + "\r\n";
	
		  //telnetClient.write(output);
		
		  //console.log('Here 3');
		  //console.log(message[1]); 
		console.log(buttonMethods);		
		//console.log('Here 4');
		var match = buttonMethods.findIndex(function(i) {
			return i.device == message[1];
		});
        //console.log(match);

		//Fix the button mappings
		//console.log(message[2]);
		switch (message[2]) {
		   case "2": button = 1
					// console.log('power on down');
					// callAPI({"on":true}, 'PUT');
					break
		   case "3": button = 3
					// console.log('favorite down');
					break
		   case "4": button = 2
				//    console.log('power off down');
				//    callAPI({"on":false}, 'PUT');
				  break
		   case "5": button = 4
				//    console.log('dimmer up down');
				   break
		   case "6": button = 5
				//    console.log('dimmer down down');
				   break
		}
		//console.log(buttonMethods[match][button]);
		if (match != -1) {
			if (buttonMethods[match][button]) {
				rampHold();
			} else {
			//console.log('Here 1');	
			longPressHold();
			}
		} else {
			//console.log('Here 2');	
			//console.log(buttonMethods);		
			longPressHold();
		}
		
		function rampHold() {
			console.log("ramp hold");
			if (message[3] == 3) {
			  start = new Date().getTime();
			  timer = setTimeout(function() {
				console.log("timer ran")
				interval = setInterval(function() {
					console.log("interval ran")
					buttonAction = "held";
					var myJSONObject = {device: message[1], button: message[2], action: buttonAction };
					callback(myJSONObject);
					//send();
					/*
					elapsed = new Date().getTime() - start; 
					if (elapsed <= 5999) {
						send();
					} else {
						clearInterval(interval);
					}
				*/
					/*
					var myJSONObject = {device: message[1], button: message[2], action: "held"};
					request({
						url: 'http://' + SMARTTHINGS_IP + ':39500',
						method: "POST",
						json: true,
						body: myJSONObject
					}, function (error, response, body){
					});
					*/
				}, intervalTime);
			  }, shortPressTime);
		  } else if (message[3] == 4) {
			  clearTimeout(timer);
			  clearInterval(interval);
			  console.log("button was released");
			  elapsed = new Date().getTime() - start; 
			  console.log(elapsed);
			  if (elapsed < shortPressTime) {
				  buttonAction = "pushed";
			  }
			  var myJSONObject = {device: message[1], button: message[2], action: buttonAction };
			  callback(myJSONObject);
			  //send();
		  }
		}
		  
		function longPressHold() {
			//console.log("long hold!");
			if (message[3] == 3) {
				//console.log('button!!');
				start = new Date().getTime();
				/*
				timer = setTimeout(function() {
					console.log("time ran");
				}, 500);
				
				*/
			} else if (message[3] == 4) {
				clearTimeout(timer);
				//console.log("button was released!");
				elapsed = new Date().getTime() - start; 
				//console.log(elapsed);
				if (elapsed < shortPressTime) {
					buttonAction = "pushed";
				} else {
					buttonAction = "held";
				}
				console.log(remote, button, buttonAction);
				// console.log(CLIENT_ID)
				// console.log(commands)
				interpretAction(remote, button, buttonAction);

				// var command = commands[[remote, button]];
				// for (light of command[0])
				// {
				// 	controlLight(light, command[1], command[2]);

				// }
				// controlLight(command[0], command[1], command[2]);
				//console.log(commands[[remote, button]]);
				//Create the json Object to send to ST
				var myJSONObject = {device: message[1], button: message[2], action: buttonAction };
				callback(myJSONObject);
			}
		  }
		
		function send() {
			console.log('in send');
			
			request({
				url: 'http://' + SMARTTHINGS_IP + ':39500',
				method: "POST",
				json: true,
				body: myJSONObject
			}, function (error, response, body){
			});
			
		  }
	  }
	});

	/* This version does long presses but not multiple helds
	var start;
	var timer;
	telnetClient.on('data', function(data) {

		var elapsed;
	   console.log('Received: ' + data);
	   if (data.toString().indexOf('login') !== -1) {
		  telnetClient.write('lutron\r\n');
	  } else if (data.toString().indexOf('password') !== -1) {
			telnetClient.write('integration\r\n');
	  } else if (isConnect == false && data.toString().indexOf('GNET>') !== -1) {
		  isConnect = true;
		  console.log("Connected!")
	  } else if (data.toString().indexOf('~DEVICE') !== -1) {
		  
		  var message = data.toString().split(',');
		  output = "#OUTPUT," + "2" + ",1," + "100" + "\r\n";
		  //telnetClient.write(output);
		  if (message[3] == 3) {
			  start = new Date().getTime();
			  timer = setTimeout(function() {
				console.log("time ran");
			  }, 500);
		  } else if (message[3] == 4) {
			  clearTimeout(timer);
			  console.log("button was released");
			  elapsed = new Date().getTime() - start; 
			  console.log(elapsed);
			  var buttonAction;
			  if (elapsed < 500) {
				  buttonAction = "pushed";
			  } else if (elapsed > 500) {
				  buttonAction = "held";
			  }
			  var myJSONObject = {device: message[1], button: message[2], action: buttonAction };
			  request({
				url: 'http://' + SMARTTHINGS_IP + ':39500',
				method: "POST",
				json: true,
				body: myJSONObject
			}, function (error, response, body){
			}); 
		  }
	  }
	});
	*/

	/*
	var start;
	var timer;
	var interval;
	telnetClient.on('data', function(data) {

		var elapsed;
	   console.log('Received: ' + data);
	   if (data.toString().indexOf('login') !== -1) {
		  telnetClient.write('lutron\r\n');
	  } else if (data.toString().indexOf('password') !== -1) {
			telnetClient.write('integration\r\n');
	  } else if (isConnect == false && data.toString().indexOf('GNET>') !== -1) {
		  isConnect = true;
		  console.log("Connected!")
	  } else if (data.toString().indexOf('~DEVICE') !== -1) {
		  
		  var message = data.toString().split(',');
		  output = "#OUTPUT," + "2" + ",1," + "100" + "\r\n";
		  //telnetClient.write(output);
		  if (message[3] == 3) {
			  start = new Date().getTime();
			  timer = setTimeout(function() {
				console.log("timer ran")
				interval = setInterval(function() {
					console.log("interval ran")
					var myJSONObject = {device: message[1], button: message[2], action: "held"};
					request({
						url: 'http://' + SMARTTHINGS_IP + ':39500',
						method: "POST",
						json: true,
						body: myJSONObject
					}, function (error, response, body){
					}); 
				}, 1000);
			  }, 500);
		  } else if (message[3] == 4) {
			  clearTimeout(timer);
			  clearInterval(interval);
			  console.log("button was released");
			  elapsed = new Date().getTime() - start; 
			  console.log(elapsed);
			  var buttonAction;
			  if (elapsed < 500) {
				  buttonAction = "pushed";
			  } else if (elapsed > 500) {
				  buttonAction = "held";
			  }
			  var myJSONObject = {device: message[1], button: message[2], action: buttonAction };
			  request({
				url: 'http://' + SMARTTHINGS_IP + ':39500',
				method: "POST",
				json: true,
				body: myJSONObject
			}, function (error, response, body){
			}); 
		  }
	  }
	});
	*/
	telnetClient.on('close', function() {
		console.log("Disconnected from SmartBridgePro")
	});
	telnetClient.on('connect', function() {
		console.log('Connected via telnet to Pro Hub');
	});
	
	telnetClient.connect(23, ip, function() {
	});
	telnetClient.setKeepAlive(true,2000);
}

app.get('/devices', function(req, res) {
	console.log("Request for Device List");
	res.setHeader('Content-Type', 'application/json');
	var combinedDevicesList = [];
	for(i = 0; i < lutronBridges.length; i++) {
		console.log(lutronBridges[i].ip);
		lutronBridges[i].sslClient.write('{"CommuniqueType":"ReadRequest","Header":{"Url":"/device"}}\n');
		lutronBridges[i].sslClient.write('{"CommuniqueType":"ReadRequest","Header":{"Url":"/virtualbutton"}}\n');
		if (lutronBridges[i].mergedDevices != null) {
			console.log('pro hub data');
			combinedDevicesList = combinedDevicesList.concat(lutronBridges[i].mergedDevices);
		} else {
			console.log('reg hub data');
			combinedDevicesList = combinedDevicesList.concat(lutronBridges[i].leapDevices);
		}
	}
	res.send(combinedDevicesList);
});

app.get('/scenes', function(req, res) {
	console.log("Request for Scenes");
	res.setHeader('Content-Type', 'application/json');
	for(i = 0; i < lutronBridges.length; i++) {
		console.log(lutronBridges[i].ip);
		res.send(lutronBridges[i].scenesList);
	}
});

app.post('/scene', function(req, res) {
	console.log("got an scene request");
	console.log(req.body.virtualButton);
	//appTelnetClient.write("#DEVICE,1," + req.body.virtualButton + ",3\r\n"); 
	res.sendStatus(200);
	
	appSSLClient.write('{"CommuniqueType": "CreateRequest","Header": {"Url": "/virtualbutton/' + req.body.virtualButton + '/commandprocessor"},"Body": {"Command": {"CommandType": "PressAndRelease"}}}\n')
});

app.post('/setLevel', function(req, res) {
	console.log("got an on request");
	console.log(req.body);
	//s = parse('hello %s, how are you doing', my_name);
	console.log(req.body.deviceID);
	console.log(req.body.level);
	if(req.body.deviceID != null) {
		appTelnetClient.write('#OUTPUT,' + req.body.deviceID + ',1,' + req.body.level + ' \r\n');  //scenes
		res.sendStatus(200);
	} else {
		appSSLClient.write('{"CommuniqueType":"CreateRequest","Header":{"Url":"/zone/' + req.body.zone + '/commandprocessor"},"Body":{"Command":{"CommandType":"GoToLevel","Parameter":[{"Type":"Level","Value":' + req.body.level +'}]}}}\n')
	}
	
});

app.post('/on', function(req, res) {
	console.log("got an on request");
	console.log(req.body.device);
	console.log(req.body.level);
	telnetClient.write("#DEVICE,1,1,3\r\n");  //scenes
	res.sendStatus(200);
});
app.listen(5000);
console.log('Listening on port 5000...');

process.on('exit', function(code) {
  console.log('About to exit with code:', code);
});

function Hub(ip) {
	this.ip = ip;
	this.pro = false;
	this.sshClient = new sshClient();
	this.sslClient = null;
	this.telnetClient = null;
	this.leapDevices = null;
	this.lipDevices = null;
	this.scenesList = null;
	this.mergedDevices = null;
	var self = this;
	
	this.initalize = function() {
	  var options = {
	   key:  fs.readFileSync('privateKey'), //key  : fs.readFileSync('private.pem'),
	   cert : JSON.parse(fs.readFileSync('appCert')), //remote_signs_app_certificate
	   ca: JSON.parse(fs.readFileSync('localCert')),  //local_signs_remote_certificate
	   rejectUnauthorized: false
	  };
	   
	   self.sslClient = tls.connect(8081, self.ip, options, function () {
	     console.log('connected at ' + Date.now());
		 appSSLClient = self.sslClient;
	     listenSSL(self.sslClient, self.ip, handleIncomingSSLData);
	     self.sslClient.write('{"CommuniqueType":"ReadRequest","Header":{"Url":"/device"}}\n');
		 self.sslClient.write('{"CommuniqueType":"ReadRequest","Header":{"Url":"/virtualbutton"}}\n');
	  });
	}
	
	function handleIncomingSSLData(data) {
		if (data.toString().indexOf('LIPIdList') !== -1) {
		  console.log('LIP Data was recieved and sent to parser');
		  var jsonData = JSON.parse(data.toString());
		  self.lipDevices = jsonData.Body.LIPIdList;
		  leapLipParser(self.lipDevices, self.leapDevices, function(data) {
			console.log("The merged data is:\n" + JSON.stringify(data))
			self.mergedDevices = data;
		  });
		} else if (data.toString().indexOf('"MultipleDeviceDefinition"') != -1) {
		  console.log('Leap Data was recieved and sent to parser');
		  var jsonData = JSON.parse(data.toString());
		  self.leapDevices = jsonData.Body.Devices;
		  if(self.leapDevices[0].ModelNumber.indexOf('PRO') != -1) {
	       self.pro = true;
	       console.log('pro hub');
	       initTelnet();
	       }
	     console.log(self.pro);
		} else if (data.toString().indexOf('MultipleVirtualButtonDefinition')  != -1) {
			console.log('Scene Data Recieved');
			var jsonData = JSON.parse(data.toString());
			var buttons = jsonData.Body.VirtualButtons;
			var tempList = [];
			for (i = 0; i < buttons.length; i++) {
				if (buttons[i].IsProgrammed == true) { 
					tempList.push(buttons[i]);
				}
			}
			self.scenesList = tempList;
			console.log(tempList);
			//Example Scene Call Device 1 (the hub) virtualbutton 2 action 3 (press)
			//~DEVICE,1,2,3

			
		} else {
			console.log(self.pro);
			if (!self.pro) {
				console.log('got the incoming data');
				console.log(data);
				var jsonData = JSON.parse(data.toString());
					request({
						url: 'http://' + SMARTTHINGS_IP + ':39500',
						method: "POST",
						json: true,
						body: jsonData
					}, function (error, response, body){
					}); 
			}
		}
	}
	
	function initTelnet() {
		console.log("starting telnet connection")
		self.telnetClient = new net.Socket();
		//listenSSL(self.sslClient, self.ip, handleIncomingSSLData);
		appTelnetClient = self.telnetClient;
		self.sslClient.write('{"CommuniqueType":"ReadRequest","Header":{"Url":"/server/2/id"}}\n');
		telnetHandler(self.telnetClient, self.ip, handleIncomingTelnetData);
	}
	
	function handleIncomingTelnetData(data) {
		
		request({
				url: 'http://' + SMARTTHINGS_IP + ':39500',
				method: "POST",
				json: true,
				body: data
			}, function (error, response, body){
		});
	}
}

exports.startup = function(SB_IP, ST_IP, USER, PW, bMethods, spTime, intTime) {
	user = USER;
	pw = PW;
	initalize(SB_IP, function () { 
		for(i = 0; i < SB_IP.length; i++) {
			console.log(SB_IP[i]);
			lutronBridges.push(new Hub(SB_IP[i]));
			lutronBridges[i].initalize();
		}
		SMARTTHINGS_IP = ST_IP;
		shortPressTime = spTime;
		intervalTime = intTime;
		buttonMethods = bMethods;
		ssdp.start();
	});
};
