 <h1 align="center">React Firestore Connect</p>

> Higher order component for React components which provides them with data from collections / documents. Super easy to use. **Both for React & React Native!**


[![NPM](https://img.shields.io/npm/v/react-firestore-connect.svg)](https://www.npmjs.com/package/react-firestore-connect)

## Install
Via yarn
```bash
yarn add react-firestore-connect
```

or NPM

```bash
npm install --save react-firestore-connect
```

## Usage
First you need to initialize react-firestore-connect with Firebase in the root JS file of your app (typically `index.js`):
```jsx
import firebase from 'firebase' // If you are developing for web
// import firebase from 'react-native-firebase' - if you are developing for mobile (React Native)

import { initializeFirebase } from 'react-firestore-connect'


initializeFirebase(firebase)
```


Afterwards, you can easily use it - by default, calls are realtime, but you can send `once` as a third arguemnt, to get data just once:
```jsx
import { connectFirestore } from 'react-firestore-connect'

class Example extends Component {
  render () {
    const {
      users,
      currentUser,
    } = this.props
    console.log('Users in the application', users)
    console.log('Currently logged in user', currentUser)
    return <div />
  }
}

export default connectFirestore(
  // db is reference to firestore DB;
  // props are any props that you are passing to the component - i.e. userId to get specific user
  // uid - userId, if user is authenticated in firebase -> firebase.auth().currentUser.uid
  (db, props, uid) => ({
    users: db.collection('names'), // You can get entire collection
    threeUsersOrdered: db.collection('names').orderBy('firstName').limit(3), // You can also do any querying as you want
    currentUser: db.collection('names').doc(uid), // You can obviously get any document by its ID
    usersArray: [db.collection('names').doc(props.id[0]), db.collection('names').doc(props.id[1]), db.collection('names').doc(props.id[2])], // You can also send array of doc referencies
  }),
  // 'once' -> pass in order to get the data just once
)(Example)

```


**See example folder for more details & api call examples!**
## License

MIT © [Olovorr](https://github.com/Olovorr) & [Webscope](https://webscope.io/)
