#! /usr/bin/node
var lutronpro = require('lutronpro');

//Get the following environment variables
var x = process.env.SMARTBRIDGE_IP;
var SMARTBRIDGE_IP = [x];
var SMARTTHINGS_IP = process.env.SMARTTHINGS_IP;
var HUEBRIDGE_IP = process.env.HUEBRIDGE_IP;

global.CLIENT_ID = process.env.CLIENT_ID;
global.CLIENT_SECRET = process.env.CLIENT_SECRET;
global.HUE_USER = process.env.HUE_USER;

//Please entery your Lutron Login Info...this simply allows the app to login and fetch the appropriate access codes and certificates automatically. It is not saved or shared anywhere than in this file.
var USER = process.env.LUTRON_USER;
var PW = process.env.LUTRON_PW;

console.log(SMARTBRIDGE_IP);
console.log(SMARTTHINGS_IP);

const HUE_BEDROOM_GROUP = 1
const HUE_DINING_GROUP = 2
const HUE_VANITY_GROUP = 3
const HUE_LIVING_ROOM_GROUP = 4
const HUE_BATHROOM_GROUP = 5
const HUE_POWDER_ROOM_GROUP = 6
const HUE_HALLWAY_GROUP = 7
const HUE_STUDY_GROUP = 8
const HUE_CLOSET_GROUP = 9
const HUE_KITCHEN_GROUP = 10
const HUE_BALCONY_GROUP = 11
const HUE_LIVING_AREA_GROUP = 12
const HUE_SLEEPING_AREA_GROUP = 13
const HUE_ALCOVE_GROUP = 14

const PICO_BEDROOM_WALL = 8 
const PICO_HALL_BEDROOM = 13
const PICO_STUDY_SHADE = 12
const PICO_STUDY_HUE_WALL = 10
const PICO_LIVING_AREA = 11
const PICO_ALCOVE_FOYER = 14
const PICO_HALLWAY_FOYER = 15
const PICO_LIVING_ROOM_FOYER = 16
const PICO_DINING_ROOM_FOYER = 17
const PICO_POWDER_ROOM = 18
const PICO_VANITY = 19
const PICO_BATHROOM = 20
const PICO_EAST_SHADE = 21
const PICO_NORTH_SHADE = 22
const PICO_BEDROOM_SHADE = 23
const PICO_KITCHEN_SHADE = 9

/*
Groups
1 : Bedroom
2 : Dining Room
3 : Vanity
4 : Living Room
5 : Bathroom
6 : Powder Room
7 : Hallway
8 : Study
9 : Office
10 : Kitchen
11 : Balcony
12 : Living Area
13 : Sleeping Area
14 : Alcove

Picos
 
 8 : Study Desk
10 : Study Wall
11 : Living Area
12 : Powder Room
13 : East Shade
14 : Hallway

Somfy
'north' : 'CC10B126.1'
,'east' : 'CC10B126.2'
,'bedroom' : 'CC10B126.3'
,'study' : 'CC10B126.4'

*/

/*
Buttons
1 : On
2 : Off
3 : Favorite
4 : Bright
5 : Dim
*/

/*
// Begin Service section
var Service = require('node-windows').Service;

// Create a new service object
var svc = new Service({
  name:'lutronpro',
  description: 'lutronpro server.',
  script: '/home/pi/node_modules/lutronpro/runServer.js'
});

// Listen for the "install" event, which indicates the
// process is available as a service.
svc.on('install',function(){
  svc.start();
});

// Listen for the "start" event and let us know when the
// process has actually started working.
svc.on('start',function(){
  console.log(svc.name+' started!\nVisit http://127.0.0.1:3000 to see it in action.');
});

// Install the script as a service.
svc.install();
// End Service section
*/


function defaultHueCommands(device) {
	return [
		[device, {'on' : true, 'bri' : 254}]
		,[device, {'on' : false}]
		,[device, {'on' : true, 'bri' : 127}]
		,[device, {'bri_inc' : 50}]
		,[device, {'bri_inc' : -50}]
	   ]
}

function defaultSomfyCommands(device) {
	return [
		[-1, device, 'up']
		, [-1, device, 'down']
		, [-1, device, 'stop']
		, [-1, device, 'raise']
		, [-1, device, 'lower']
	]
}

//[
	// [1, {'on' : true, 'bri' : 254}, 'action', 'PUT', 'groups']
	// ,[1, {'on' : false}, 'action', 'PUT']
	// ,[1, {'on' : true, 'bri' : 127}, 'action']
	// ,[1, {'bri_inc' : 50}]
	// ,[1, {'bri_inc' : -50}]
	//  ] 

	// [
	// 	[8, {'on' : true, 'bri' : 254}, 'action', 'PUT', 'groups']
	// 	,[8, {'on' : false}, 'action', 'PUT']
	// 	,[8, {'on' : true, 'bri' : 127}, 'action']
	// 	,[8, {'bri_inc' : 50}]
	// 	,[8, {'bri_inc' : -50}]
	// 	  ]

global.commands = {
			    [PICO_EAST_SHADE] : defaultSomfyCommands('east')
			  , [PICO_NORTH_SHADE] : defaultSomfyCommands('north')
			  , [PICO_STUDY_SHADE] : defaultSomfyCommands('study')
			  , [PICO_BEDROOM_SHADE] : defaultSomfyCommands('bedroom')
			  , [PICO_KITCHEN_SHADE] : defaultSomfyCommands('kitchen')
			  , [PICO_STUDY_HUE_WALL] : defaultHueCommands(HUE_STUDY_GROUP)
			  , [PICO_LIVING_AREA] : defaultHueCommands(HUE_LIVING_AREA_GROUP)
			  , [PICO_HALLWAY_FOYER] : defaultHueCommands(HUE_HALLWAY_GROUP)
			  , [PICO_DINING_ROOM_FOYER] : defaultHueCommands(HUE_DINING_GROUP)
			  , [PICO_LIVING_ROOM_FOYER] : defaultHueCommands(HUE_LIVING_ROOM_GROUP)
			  , [PICO_POWDER_ROOM] : defaultHueCommands(HUE_POWDER_ROOM_GROUP)
			  , [PICO_VANITY] : defaultHueCommands(HUE_VANITY_GROUP)
			  , [PICO_BATHROOM] : defaultHueCommands(HUE_BATHROOM_GROUP)
			  , [PICO_BEDROOM_WALL] : defaultHueCommands(HUE_BEDROOM_GROUP)
			  , [PICO_HALL_BEDROOM] : defaultHueCommands(HUE_HALLWAY_GROUP)
};

function sendShadeCommand(shade, command) { 
		
	// Use child_process.spawn method from  
	// child_process module and assign it 
	// to variable spawn 
	console.log('somfy', shade, command);
	var spawn = require("child_process").spawn; 
	
	// Parameters passed in spawn - 
	// 1. type_of_script 
	// 2. list containing Path of the script 
	//    and arguments for the script  
	
	// var process = spawn('python', ['/Users/joey/Dev/Somfy/test.py', 'study', 'down'] ); 
	var process = spawn('python3', ['./somfy.py', shade, command] ); 

	process.stdout.on('data', function(data) { 
	 	console.log(data.toString()); 
	 } )

} 

global.sendHueCommand = function sendCommand(data, options)	{
	//console.log('********* sendcommand ', data, options);
	var http = require('http');

	var req = http.request(options, function(res) {
		var msg = '';
	
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
		msg += chunk;
		});
		res.on('end', function() {
		console.log(JSON.parse(msg));
		});
	});

	var data = JSON.stringify(data);
	req.write(data);
	req.end();

}

global.makeHueCommand = function makeCommand(device, data, action = 'action', method = 'PUT', devicetype = 'groups') {
//function makeCommand(device, data, action = 'action', method = 'PUT', devicetype = 'groups') {
	var options = {
		host: HUEBRIDGE_IP,
		path: '/api/' + HUE_USER + '/' + devicetype + '/' + device + '/' + action,
		method: method
	};
	sendHueCommand(data, options);
}

global.interpretAction = function interpretAction(remote, button, buttonAction) {
	console.log('interpretAction', remote);
	// console.log(commands)
	var command = commands[remote];
	// console.log(command)
	if (command != null) {
		button1 = parseInt(button) - 1;
		if (button1 < command.length) {
			var command1 = command[button1];
			// console.log(command1)
			device = command1[0];
			if (device == -1) {
				// Somfy
				shade = command1[1];
				action = command1[2];
				console.log('send shade command', shade, action);
				sendShadeCommand(shade, action);
			} else {
				// Hue
				data = command1[1];
				action = (command1.length >= 3) ? command1[2] : 'action';
				method = (command1.length >= 4) ? command1[3] : 'PUT';
				devicetype = (command1.length >= 5) ? command1[4] : 'groups';
				console.log(device, data, action, method, devicetype);
				makeHueCommand(device, data, action, method, devicetype);
			}
		}
	}
}

// function controlLight(lights, method, data, method = 'PUT', command = 'action') {
// 		var options = {
// 			host: HUEBRIDGE_IP,
// 			path: '/api/' + HUE_USER + '/lights/' + light + '/' + action,
// 			method: method
// 		};
// 		sendCommand(data, options);
// }


var shortPressTime = 500;  //Time (in ms) to hold button to trigger a held event vs a single press
var intervalTime = 750;  //Frequency (in ms) to send a held button event if using the ramp hold method

/* Use this map to define how you want each button to react when held. 
	**The device is the device number of the Pico. You can press a button and look at the logs while this is running to get it.
	**The numbers represent each button. 
	**You do not have to enter anything for this if you do not want to and it will default to a single hold event
	**Use the example below for multiple devices
	**
	
	**A True value means that the button will use the ramp style. A held event will be sent at the interval above until the button is released
	**A False value means the button will send a single held button event when held for longer than shortPressTime above
	
	
var buttonMethods = [
	{device: 1,
	4: true,
	5: true
	},
	{device: 2,
	1: true,
	3: false,
	4: false,
	5: true
	}
];
*/

var buttonMethods = [
	{device: '3',
	4: true,
	5: true
	}
];

// module.exports = {
// 	makeCommand : makeCommand,
// 	sendCommand : sendCommand
// };

lutronpro.startup(SMARTBRIDGE_IP, SMARTTHINGS_IP, USER, PW, buttonMethods, shortPressTime, intervalTime);

