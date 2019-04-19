// Socket configuration
let app = require('express')();
let serverListener = require('http').Server(app);
let socketHandler = require('socket.io')(serverListener);
let fs = require('fs');

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

app.get('/index.js', function(req, res){
  res.sendFile(__dirname + '/index.js');
});

socketHandler.on('connection', function(socket){
  console.log('Connection stablished.');
  socket.on('chat message', function(msg){
    console.log('message: ' + msg);
  });
  socket.on('save-model', function(model){
    fs.writeFile("./model.json", model, function(err) {
      if (err) {
        console.log(err);
      }
    });
  });
  socket.on('load-model', function(model){
    fs.readFile("./model.json", {encoding: 'utf8'}, function(err, model){
      if (err) {
        console.log(err);
        console.log("No model to load.")
        model = null;
      }
      socket.emit('receive-model', model);
    });
  });
});


serverListener.listen(6767, function(){
    console.log("Listening on port 6767");
});
