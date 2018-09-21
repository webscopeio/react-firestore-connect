# react-firestore-connect

> HOC for React components which maps collections / documents from firestore into react components props.

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

## What can you do with it?

This package aims to make getting data from firestore super easy.



## Usage
```jsx
import { connectFirestore } from 'react-firestore-connect'

// Functions must be async!
const getAllUsers = async (db: Object) => db
  .collection('names')
  .orderBy('firstName')

const getUserById = async (db: Object, id: string) => db
  .collection('names')
  .doc(id)

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
  (db, props, uid) => ({
    users: getAllUsers(db),
    currentUser: getUserById(db, uid),
  }),
  Example
)

```


## License

MIT © [Olovorr](https://github.com/Olovorr)
