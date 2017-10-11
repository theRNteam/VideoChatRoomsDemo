'use strict';

import React, { Component } from 'react';
import {
  AppRegistry,
  Dimensions,
  StyleSheet,
  Text,
  TouchableHighlight,
  TouchableOpacity,
  View,
  TextInput,
  ListView,
  Platform,
  ScrollView,
} from 'react-native';
var {height, width} = Dimensions.get('window');
import io from 'socket.io-client';

const socket = io.connect('https://react-native-webrtc.herokuapp.com', {transports: ['websocket']});

import {
  RTCPeerConnection,
  RTCMediaStream,
  RTCIceCandidate,
  RTCSessionDescription,
  RTCView,
  MediaStreamTrack,
  getUserMedia,
} from 'react-native-webrtc';

const configuration = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]};

const pcPeers = {};
let localStream;

function getLocalStream(isFront, callback) {

  let videoSourceId;

  // on android, you don't have to specify sourceId manually, just use facingMode
  // uncomment it if you want to specify
  if (Platform.OS === 'ios') {
    MediaStreamTrack.getSources(sourceInfos => {
      for (const i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i];
        if(sourceInfo.kind == "video" && sourceInfo.facing == (isFront ? "front" : "back")) {
          videoSourceId = sourceInfo.id;
        }
      }
    });
  }
  getUserMedia({
    audio: true,
    video: {
      mandatory: {
        minWidth: 640, // Provide your own width, height and frame rate here
        minHeight: 360,
        minFrameRate: 30,
      },
      facingMode: (isFront ? "user" : "environment"),
      optional: (videoSourceId ? [{sourceId: videoSourceId}] : []),
    }
  }, function (stream) {
    callback(stream);
  }, logError);
}

function join(roomID) {
  socket.emit('join', roomID, function(socketIds){
    for (const i in socketIds) {
      const socketId = socketIds[i];
      createPC(socketId, true);
    }
  });
}

function createPC(socketId, isOffer) {
  const pc = new RTCPeerConnection(configuration);
  pcPeers[socketId] = pc;

  pc.onicecandidate = function (event) {
    if (event.candidate) {
      socket.emit('exchange', {'to': socketId, 'candidate': event.candidate });
    }
  };

  function createOffer() {
    pc.createOffer(function(desc) {
      pc.setLocalDescription(desc, function () {
        socket.emit('exchange', {'to': socketId, 'sdp': pc.localDescription });
      }, logError);
    }, logError);
  }

  pc.onnegotiationneeded = function () {
    if (isOffer) {
      createOffer();
    }
  }

  pc.oniceconnectionstatechange = function(event) {
    if (event.target.iceConnectionState === 'completed') {
      setTimeout(() => {
        getStats();
      }, 1000);
    }
    if (event.target.iceConnectionState === 'connected') {
      createDataChannel();
    }
  };
  pc.onsignalingstatechange = function(event) {
    
  };

  pc.onaddstream = function (event) {
    container.setState({info: 'One peer join!'});

    const remoteList = container.state.remoteList;
    remoteList[socketId] = event.stream.toURL();
    container.setState({ remoteList: remoteList });
  };
  pc.onremovestream = function (event) {
    
  };

  pc.addStream(localStream);
  function createDataChannel() {
    if (pc.textDataChannel) {
      return;
    }
    const dataChannel = pc.createDataChannel("text");

    dataChannel.onerror = function (error) {
      
    };

    dataChannel.onmessage = function (event) {
      
      container.receiveTextData({user: socketId, message: event.data});
    };

    dataChannel.onopen = function () {
      container.setState({textRoomConnected: true});
    };

    dataChannel.onclose = function () {
      
    };

    pc.textDataChannel = dataChannel;
  }
  return pc;
}

function exchange(data) {
  const fromId = data.from;
  let pc;
  if (fromId in pcPeers) {
    pc = pcPeers[fromId];
  } else {
    pc = createPC(fromId, false);
  }

  if (data.sdp) {
    pc.setRemoteDescription(new RTCSessionDescription(data.sdp), function () {
      if (pc.remoteDescription.type == "offer")
        pc.createAnswer(function(desc) {
          pc.setLocalDescription(desc, function () {
            socket.emit('exchange', {'to': fromId, 'sdp': pc.localDescription });
          }, logError);
        }, logError);
    }, logError);
  } else {
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

function leave(socketId) {
  const pc = pcPeers[socketId];
  const viewIndex = pc.viewIndex;
  pc.close();
  delete pcPeers[socketId];

  const remoteList = container.state.remoteList;
  delete remoteList[socketId]
  container.setState({ remoteList: remoteList });
  container.setState({info: 'One peer leave!'});
}

socket.on('exchange', function(data){
  exchange(data);
});
socket.on('leave', function(socketId){
  leave(socketId);
});

socket.on('connect', function(data) {
  getLocalStream(true, function(stream) {
    localStream = stream;
    container.setState({selfViewSrc: stream.toURL()});
    container.setState({status: 'ready', info: 'Please enter or create room ID'});
  });
});

function logError(error) {
  
}

function mapHash(hash, func) {
  const array = [];
  for (const key in hash) {
    const obj = hash[key];
    array.push(func(obj, key));
  }
  return array;
}

function getStats() {
  const pc = pcPeers[Object.keys(pcPeers)[0]];
  if (pc.getRemoteStreams()[0] && pc.getRemoteStreams()[0].getAudioTracks()[0]) {
    const track = pc.getRemoteStreams()[0].getAudioTracks()[0];
    pc.getStats(track, function(report) {
    }, logError);
  }
}

let container;

class VideoChatRoomsDemo extends Component {
  constructor(props: Object) {
    super(props);
    this.state={
      info: 'Initializing',
      status: 'init',
      roomID: '',
      isFront: true,
      selfViewSrc: null,
      remoteList: {},
      textRoomConnected: false,
      textRoomData: [],
      textRoomValue: '',
    };
    this.ds = new ListView.DataSource({rowHasChanged: (r1, r2) => true});
  }

  componentDidMount() {
    container = this;
  }

  _press(event) {
    this.refs.roomID.blur();
    this.setState({status: 'connect', info: 'Connecting'});
    join(this.state.roomID);
  }

  _switchVideoType() {
    const isFront = !this.state.isFront;
    this.setState({isFront});
    getLocalStream(isFront, function(stream) {
      if (localStream) {
        for (const id in pcPeers) {
          const pc = pcPeers[id];
          pc && pc.removeStream(localStream);
        }
        localStream.release();
      }
      localStream = stream;
      container.setState({selfViewSrc: stream.toURL()});

      for (const id in pcPeers) {
        const pc = pcPeers[id];
        pc && pc.addStream(localStream);
      }
    });
  }

  receiveTextData(data) {
    const textRoomData = this.state.textRoomData.slice();
    textRoomData.push(data);
    this.setState({textRoomData, textRoomValue: ''}, () => {
      this.refs.chat.scrollToEnd({animated: true});
    });
  }

  _textRoomPress() {
    if (!this.state.textRoomValue) {
      return
    }
    const textRoomData = this.state.textRoomData.slice();
    textRoomData.push({user: 'Me', message: this.state.textRoomValue});
    for (const key in pcPeers) {
      const pc = pcPeers[key];
      pc.textDataChannel.send(this.state.textRoomValue);
    }
    this.setState({textRoomData, textRoomValue: ''}, () => {
      this.refs.chat.scrollToEnd({animated: true});
    });
  }

  _renderTextRoom() {
    return (
      <View>
        <ListView
          dataSource={this.ds.cloneWithRows(this.state.textRoomData)}
          style={styles.listViewContainer}
          ref='chat'
          enableEmptySections={true}
          renderRow={rowData => <Text>{`${rowData.user}: ${rowData.message}`}</Text>}
          />
          <View />
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5}}>
          <TextInput
            style={{width: 300, height: 40}}
            underlineColorAndroid={ 'transparent' }
            placeholder={'Type a message here'}
            onChangeText={value => this.setState({textRoomValue: value})}
            value={this.state.textRoomValue}
          />
          <TouchableOpacity
            style={{backgroundColor: '#00b7ff', marginHorizontal: 5}}
            onPress={this._textRoomPress.bind(this)}>
            <Text style={{textAlign: 'center', color: 'white', paddingHorizontal: 10, paddingVertical: 5}}>
              Send
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>
          {this.state.info}
        </Text>
        {this.state.textRoomConnected && this._renderTextRoom()}
      <ScrollView style={{flex:1, paddingBottom: 20}}
                  keyboardShouldPersistTaps={'always'}>
        { this.state.status == 'ready' ?
          (<View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <TextInput
              ref='roomID'
              autoCorrect={false}
              underlineColorAndroid={ 'transparent' }
              style={{width: 200, height: 40}}
              placeholder={'Enter room id here'}
              onChangeText={(text) => this.setState({roomID: text})}
              value={this.state.roomID}
            />
            <TouchableOpacity
              style={{backgroundColor: '#00b7ff', marginHorizontal: 5}}
              onPress={this._press.bind(this)}>
              <Text style={{textAlign: 'center', color: 'white', paddingHorizontal: 10, paddingVertical: 5}}>Enter room</Text>
            </TouchableOpacity>
          </View>) : null
        }
        <TouchableOpacity
          style={{width: 150, backgroundColor: '#00b7ff', margin: 10, alignItems: 'center', justifyContent: 'center'}}
          onPress={this._switchVideoType.bind(this)}>
          <Text style={{textAlign: 'center', color: 'white', paddingHorizontal: 10, paddingVertical: 5}}>Switch camera</Text>
        </TouchableOpacity>
        <RTCView streamURL={this.state.selfViewSrc} style={styles.selfView} objectFit={'cover'}/>
        {
          mapHash(this.state.remoteList, function(remote, index) {
            return <RTCView key={index} streamURL={remote} style={styles.remoteView} objectFit={'cover'}/>
          })
        }
        </ScrollView>
      </View>
    );
  }
}




const styles = StyleSheet.create({
  selfView: {
    width: width -20,
    alignSelf: 'center',
    height: 250,
    marginVertical: 10,
  },
  remoteView: {
    width: width -20,
    alignSelf: 'center',
    height: 250,
    marginVertical: 10,
  },
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  listViewContainer: {
    height: 120,
    paddingBottom: 10,
    marginBottom: 10,
  },
});

module.exports = VideoChatRoomsDemo;
