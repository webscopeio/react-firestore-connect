// @flow
import React, { Component } from 'react'

import { connectFirestore } from 'react-firestore-connect'
import { getAllUsers, getAllUsersOrdered, getThreeUsersOrdered, getUserByFirstName, getUserById } from './getters'

type uid = string

type UserType = {|
  id: string,
  firstName: string,
  lastName: string,
  friends: Array<uid>,
|}

type OliverType = {|
  ...UserType,
  firstName: 'Oliver',
|}

type Props = {|
  users: Array<UserType>,
  usersOrdered: Array<UserType>,
  olivers: Array<OliverType>,
  oliver: OliverType,
  threeUsers: Array<UserType>
|}


const oliverFriendsWrapper = ({ oliverFriends }) => {
  if (!oliverFriends) {
    return <div />
  }
  const oliverFriendsString = oliverFriends.map(
    ({ firstName }) => firstName
  ).join(' and ')

  return (
    <div>
      {
        oliverFriendsString
      }
    </div>
  )
}

// Example how to resolve array of promises
const OliverFriendsWrapper = connectFirestore(
  (db, props) => ({
    oliverFriends: props.oliver.friends.map(
      friendId => getUserById(db, friendId)
    ),
  }),
  oliverFriendsWrapper,
)

// eslint-disable-next-line react/prefer-stateless-function
class App extends Component<Props> {
  render () {
    const {
      users,
      usersOrdered,
      olivers,
      threeUsers,
      oliver,
    } = this.props
    return (
      <div className="main-wrapper">
        <h1>Call examples with data</h1>
        <div className="">
          <h2>All users</h2>
          {users && users.map(
            ({ firstName, id, lastName }) => <div key={id}>{firstName} {lastName}</div>)}
        </div>
        <div className="">
          <h2>Get all users (Ordered)</h2>
          {usersOrdered && usersOrdered.map(
            ({ firstName, id }) => <div key={id}>{firstName}</div>)}
        </div>
        <div className="">
          <h2>Get 3 users (Ordered)</h2>
          {threeUsers && threeUsers.map(
            ({ firstName, id }) => <div key={id}>{firstName}</div>)}
        </div>
        <div className="">
          <h2>Query for users by first name (Oliver)</h2>
          {olivers && olivers.map(
            ({ firstName, id, lastName }) => <div key={id}>{firstName} {lastName}</div>)}
        </div>
        <div className="">
          <h2>Get all Oliver Friends</h2>
          {
            oliver && <OliverFriendsWrapper oliver={oliver} />
          }
        </div>
      </div>
    )
  }
}

export default connectFirestore(
  db => ({
    users: getAllUsers(db),
    usersOrdered: getAllUsersOrdered(db),
    olivers: getUserByFirstName(db, 'Oliver'),
    threeUsers: getThreeUsersOrdered(db),
    oliver: getUserById(db, 'VeLBOoQVssxFrlcsMBu0'),
  }),
  App
)
