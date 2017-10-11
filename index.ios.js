/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, { Component } from 'react';
import {
  AppRegistry,
  View
} from 'react-native';
import VideoChatRoomsDemo1 from './Chat';

export default class VideoChatRoomsDemo extends Component {
  render() {
    return (
      <View style={{flex: 1}}>
        <VideoChatRoomsDemo1 />
      </View>
    );
  }
}

AppRegistry.registerComponent('VideoChatRoomsDemo', () => VideoChatRoomsDemo);