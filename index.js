// The following code was made following the instructions from 
// Google's Tensorflow.js Transfer Learning Image Classifier tutorial.
// Tutorial's link: https://codelabs.developers.google.com/codelabs/tensorflowjs-teachablemachine-codelab/index.html?index=..%2F..index#0
import 'babel-polyfill';
//import * as tf from '@tensorflow/tfjs';
const tf = require('@tensorflow/tfjs');
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as knnClassifier from '@tensorflow-models/knn-classifier';
import io from 'socket.io-client';
import { func } from '@tensorflow/tfjs-data';
//import * as fs from '@fs/';
//let fs = require('fs-');
//import {write}
//import {writeFile, readFile} from 'fs-'
//Enviar mensaje por que socket
const socket = io('http://localhost:6767');

function sendCommand(event, command) {
    console.log(`sending the event ${event}`)
    console.log(`Sending the command ${command}`);
    socket.emit(event, command);
    socket.on('status', status => {
      console.log(status)
    });
  }

function getSensorsData() {
  socket.on('state', state => {
    document.getElementById('pitch').innerHTML = state.pitch
    document.getElementById('yaw').innerHTML = state.yaw
    document.getElementById('roll').innerHTML = state.roll
    document.getElementById('height').innerHTML = state.h
    document.getElementById('tof').innerHTML = state.tof
    document.getElementById('barometer').innerHTML = state.baro
    document.getElementById('time').innerHTML = state.time
    document.getElementById('battery').innerHTML = state.bat
  })
}

const classifier = knnClassifier.create();
const webcamElement = document.getElementById('webcam');
let net;
let selectedMediaDevice;

// Here we get the Id for the usb webcam
// error handler still missing
async function getUsbWebCam(){
  return new Promise((resolve, reject) => {
    const enumeratorPromise = navigator.mediaDevices.enumerateDevices();
    let result;
    enumeratorPromise.then( (devices) => {
      devices.forEach(element => {
        if (element['label'] == 'HD Pro Webcam C920 (046d:082d)') {
          result = element['deviceId'];
        }
      });
      resolve(result);
    })
  });
}

async function setupWebcam(selectedMediaDevice) {
    return new Promise((resolve, reject) => {
      const navigatorAny = navigator;
      let parameters;
      navigator.getUserMedia = navigator.getUserMedia ||
          navigatorAny.webkitGetUserMedia || navigatorAny.mozGetUserMedia ||
          navigatorAny.msGetUserMedia;
      if (navigator.getUserMedia) {
        // Here we pick the proper configuration, depending on the camera used.
        // Integrated (Browser picks default video device)
        if (selectedMediaDevice == null){
          parameters = {video: {frameRate: { ideal: 10, max: 15 }}};
        // USB webCam
        } else {
          parameters = {video: {deviceId: selectedMediaDevice}}
        }
        console.log("parameters",parameters);
        //console.log("selectedMediaDevice",selectedMediaDevice);
        navigator.getUserMedia(parameters,
          stream => {
            webcamElement.srcObject = stream;
            webcamElement.addEventListener('loadeddata',  () => resolve(), false);
          },
          error => reject());
      } else {
        reject();
      }
    });
}

async function predict() {
  // First, we stop all video streams from camera.
  //webcamElement.srcObject.getVideoTracks().forEach(track => track.stop());
  let iterate = true;
  //console.log("Inside predict", classifier.getNumExamples());
  document.getElementById('stop').addEventListener('click', () => { return iterate = false });
  const classes = ['stand by','up', 'down', 'left', 'right', 'land', 'take off','forward', 'back'];
  let predictedSamples = [];
  while (iterate) {
    if (predictedSamples.length === 29) {
      let quantityCommands = predictedSamples.reduce((counterCommands, command) => { counterCommands[command] = (counterCommands[command] || 0) + 1; return counterCommands;}, {});
      let indexesArray = [0, 0, 0, 0, 0, 0, 0, 0, 0]
      //console.log("tamano: ", classes.length, indexesArray)
      Object.keys(quantityCommands).forEach( (key) => {
        //console.log(key, quantityCommands[key]);
        indexesArray[classes.indexOf(key)] = quantityCommands[key] 
      })
      //console.log(indexesArray)
      let mostRepeated = Math.max(...indexesArray);
      console.log("before sendCommand ",mostRepeated,indexesArray)
      sendCommand('command', classes[indexesArray.indexOf(mostRepeated)]);
      predictedSamples = [];
      quantityCommands = {};
    }
    // Get the activation from mobilenet from the webcam.
    const activation = net.infer(webcamElement, 'conv_preds');
    // Get the most likely class and confidences from the classifier module.
    const result = await classifier.predictClass(activation);
    predictedSamples.push(classes[result.classIndex]);
    //console.log("classes[result.classIndex]",classes[result.classIndex],result)
    document.getElementById('console').innerText = `
      prediction: ${classes[result.classIndex]}\n
      probability: ${result.confidences[result.classIndex]}
    `;
    await tf.nextFrame();

    if (!iterate) {
      document.getElementById('btn-predict').removeEventListener('click', () => predict());
    }
  }
}

// The saveModel and loadModel functions are taken from: https://github.com/tensorflow/tfjs/issues/633#issuecomment-456308218
function saveModel() {
  let dataset = classifier.getClassifierDataset()
  var datasetObj = {}
  Object.keys(dataset).forEach((key) => {
    let data = dataset[key].dataSync();
    datasetObj[key] = Array.from(data); 
  });
  let jsonData = JSON.stringify(datasetObj);
  //fs.writeFile("./model.json", jsonData, function(err) {
  //  if (err) {
  //      console.log(err);
  //  }
  //});
  //localStorage.setItem("model.json", jsonData);
  console.log(jsonData)
  sendCommand('save-model', jsonData);
  console.log("Model saved in localStorage");
}

async function loadModel() {
  //let dataset = localStorage.getItem("model.json")
  let dataset;
  sendCommand('load-model', dataset)

  socket.on('receive-model', function(dataset) {
    if (dataset == null) {
      console.log("No KNN model to load");
    } else {
      console.log(dataset);
      let tensorObj = JSON.parse(dataset)
      Object.keys(tensorObj).forEach((key) => {
        console.log("tensorObj[key]: ",tensorObj[key], "tensorObj[key].length: ", tensorObj[key].length);
        tensorObj[key] = tf.tensor(tensorObj[key], [tensorObj[key].length / 1024, 1024])
      })
      classifier.setClassifierDataset(tensorObj);
      console.log("Succesfully loaded KNN model.")
    }
    //fs.readFile("./model.json", {encoding: 'utf8'}, function(err, dataset){
    //  if (err) {
    //    console.log(err);
    //    console.log("No model to load.")
    //  }
    //});
  })
};

async function app() {

  console.log('Loading mobilenet..');
  getSensorsData();
  
  // Load the model.
  net = await mobilenet.load();
  selectedMediaDevice = await getUsbWebCam();
  console.log('Sucessfully loaded mobilenet model');
  
  await loadModel();
  await setupWebcam(selectedMediaDevice);
  // Reads an image from the webcam and associates it with a specific class index.
  const addExample = classId => {
    // Get the intermediate activation of MobileNet 'conv_preds' and pass that
    // to the KNN classifier.
    const activation = net.infer(webcamElement, 'conv_preds');
      
    // Pass the intermediate activation to the classifier.
    classifier.addExample(activation, classId);
  };
  
  // When clicking a button, add an example for that class.
  document.getElementById('class-standBy').addEventListener('click', () => addExample(0));
  document.getElementById('class-up').addEventListener('click', () => addExample(1));
  document.getElementById('class-down').addEventListener('click', () => addExample(2));
  document.getElementById('class-left').addEventListener('click', () => {addExample(3);console.log(classifier.classDatasetMatrices);});
  document.getElementById('class-right').addEventListener('click', () => addExample(4));
  document.getElementById('class-land').addEventListener('click', () => addExample(5));
  document.getElementById('class-takeOff').addEventListener('click', () => addExample(6));
  document.getElementById('class-forward').addEventListener('click', () => addExample(7));
  document.getElementById('class-back').addEventListener('click', () => addExample(8));

  // Only do predictions
  document.getElementById('btn-predict').addEventListener('click', () => { if (classifier.getNumClasses() > 0) predict() });
  
  // save local model
  document.getElementById('btn-save-model').addEventListener('click', () => saveModel() );

  while (true) {
    await tf.nextFrame();
    document.getElementById('num-examples').innerText = `
      Number of classes: ${classifier.getNumClasses()}\n
      Number of total samples: ${classifier.getNumExamples()}\n
      Examples by class: \n
      Stand by = ${classifier.getClassExampleCount()[0]}\n
      Up = ${classifier.getClassExampleCount()[1]}\n
      Down = ${classifier.getClassExampleCount()[2]}\n
      Left = ${classifier.getClassExampleCount()[3]}\n
      Right = ${classifier.getClassExampleCount()[4]}\n
      Land = ${classifier.getClassExampleCount()[5]}\n
      Take Off = ${classifier.getClassExampleCount()[6]}\n
      Forward = ${classifier.getClassExampleCount()[7]}\n
      Back = ${classifier.getClassExampleCount()[8]}\n
    `;
  }
}

app();
