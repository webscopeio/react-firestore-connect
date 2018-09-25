// @flow
import React from 'react'
import hoistNonReactStatics from 'hoist-non-react-statics'

type QueryMap = {
  [string]: Promise<any> | Array<Promise<any>>,
}

type State = {|
  results: {
    [string]: any,
  },
  references: {
    [string]: Function,
  }
|}

let firebase: any = null

function initializeFirebase(firebaseInstance: any) {
  firebase = firebaseInstance
}

const connectFirestore = (
  queryMapFn: (db: Object, props: *, uid: string | null) => QueryMap,
  ComposedComponent: any,
  // By default we fetch data with realTime listener,
  // but programmer can specify to get data just once
  type?: 'once'
  // Either firebase from 'react-native-firebase' for mobile apps
  // or firebase from 'firebase' for web apps
) => {
  class FirestoreProvider extends React.Component<any, State> {
    state = {
      results: {},
      references: {},
    }
    componentDidMount = () => {
      if (!firebase) {
        console.error('No firebase instance provided! Please, make sure that you invoked ' +
          'initializeFirebase function with correct firebase instance in the root of your application!')
        return
      }

      let uid = null
      try {
        // $FlowFixMe
        uid = firebase.auth().currentUser && firebase.auth().currentUser.uid
      } catch (e) {
        console.warn('Unable to retrieve current user.', e)
      }

      const queryMap = queryMapFn(firebase.firestore(), this.props, uid)

      Object.entries(queryMap).forEach(
        // Type should be [string, Promise<any>], but flow cannot deal with Object.entries
        // see issue https://github.com/facebook/flow/issues/2221
        ([property, query]: [string, any]) => {
          if (query) {
            switch (type) {
              case 'once': {
                // Checks whether it is array of docRefs or just one docRef
                if (Array.isArray(query)) {
                  query.map((potentialDocRef) => {
                    // Basically checks whether function is promise (if yes, it is probably
                    // async function), if yes handles it as promise
                    if (potentialDocRef.then) {
                      // Renaming just for clarity
                      return potentialDocRef
                        .then(docRef => this.resolveGetQuery(docRef, property, true))
                    }
                    // Otherwise treat the call as a normal docRef
                    return this.resolveGetQuery(potentialDocRef, property, true)
                  })
                } else if (query.then) {
                  // Same as above - checks whether it is promise (async function)
                  query
                    .then(docRef => this.resolveGetQuery(docRef, property))
                } else {
                  // Otherwise treat the call as a normal docRef (query)
                  this.resolveGetQuery(query, property)
                }
                break
              }
              default: {
                // Checks whether it is array of docRefs or just one docRef
                if (Array.isArray(query)) {
                  query.map((potentialDocRef) => {
                    // Basically checks whether function is promise (if yes, it is probably
                    // async function), if yes handles it as promise
                    if (potentialDocRef.then) {
                      return potentialDocRef
                        .then(docRef => this.resolveRealTimeQuery(docRef, property, true))
                    }
                    // Otherwise treat the call as a normal docRef
                    return this.resolveRealTimeQuery(potentialDocRef, property, true)
                  })
                } else if (query.then) {
                  // Same as above - checks whether it is promise (async function)
                  query
                    .then(docRef => this.resolveRealTimeQuery(docRef, property))
                } else {
                  // Otherwise treat the call as a normal docRef (query)
                  this.resolveRealTimeQuery(query, property)
                }
              }
            }
          }
        }
      )
    }
    componentWillUnmount = () => {
      if (!firebase) {
        return
      }
      // If type of connection is real time, unsubscribe listener for the data
      if (type !== 'once') {
        Object.values(this.state.references).forEach(
          (reference) => {
            if (Array.isArray(reference)) {
              // In case Array of promises were provided, unsubscribe every one of the listeners
              // $FlowFixMe
              return reference.forEach(ref => ref())
            }
            // $FlowFixMe
            return reference() // this unsubscribes given reference
          }
        )
      }
    }

    resolveGetQuery = (docRef: Object, property: string, isArray?: boolean) => {
    // We want to be safe in here, so due to some inconsistent state whole app
    // won't crash. This shouldn't happen unless programmer misuses this HOC
      if (docRef && docRef.get) {
        docRef
          .get()
          .then((querySnapshot) => {
            // Checks whether we are working with querySnapshot or with a doc
            if (querySnapshot.docs) {
              return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
              }))
            }
            // Otherwise, it is doc - return doc itself & rename it for clarity
            const doc = querySnapshot
            return (
              doc.exists
                ? ({
                  id: doc.id,
                  ...doc.data(),
                })
                : null
            )
          })
          .then(data => this.updateResults(data, property, isArray))
      } else {
        console.error('docRef.get not found! Do not include .get() in your firestore call!')
        // If something weird happens, just store docRef for easier debugging
        this.updateResults(docRef, property, isArray)
      }
    }

  resolveRealTimeQuery = (docRef: Object, property: string, isArray?: boolean) => {
    // We want to be safe in here, so due to some inconsistent state whole app
    // won't crash. This shouldn't happen unless programmer misuses this HOC
    if (docRef && docRef.onSnapshot) {
      const reference = docRef
        .onSnapshot((querySnapshot) => {
          // Checks whether we are working with querySnapshot or with a doc
          if (querySnapshot.docs) {
            // If it is query snapshot, save entire result set
            const data = querySnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
            }))
            this.updateResults(data, property, isArray)
          } else {
            // Otherwise, it is doc - save snapshot of the doc itself.
            // Renamed for clarity.
            const doc = querySnapshot
            const data = doc.exists ? ({
              id: doc.id,
              ...doc.data(),
            }) : null
            this.updateResults(data, property, isArray)
          }
        })
      // Store the reference, so when unmounting we can cancel the listener
      this.updateReferences(reference, property, isArray)
      return reference
    }
    // This is done mainly
    if (docRef && docRef.then) {
      docRef
        .then(docRef => this.resolveRealTimeQuery(docRef, property, isArray))
    }

    console.error('docRef.onSnapshot not found! Do not include .onSnapshot() in your firestore call!')
    // If something weird happens, just store docRef for easier debugging
    return this.updateResults(docRef, property, isArray)
  }

  updateResults = (data: any, property: string, isArray?: boolean) => {
    this.setState((state) => {
      let dataInCorrectFormat = data
      if (isArray) {
        dataInCorrectFormat = state.results[property]
          ? [...state.results[property], data]
          : [data]
      }
      return ({
        results: {
          ...state.results,
          [property]: dataInCorrectFormat,
        },
      })
    })
  }

  updateReferences = (reference: Function, property: string, isArray?: boolean) => {
    this.setState((state) => {
      let referenceInCorrectFormat = reference
      if (isArray) {
        referenceInCorrectFormat = state.references[property]
          ? [...state.references[property], reference]
          : [reference]
      }
      return ({
        references: {
          ...state.references,
          [property]: referenceInCorrectFormat,
        },
      })
    })
  }

  render() {
    return (
      <ComposedComponent
        {...this.props}
        {...this.state.results}
      />
    )
  }
  }

  hoistNonReactStatics(FirestoreProvider, ComposedComponent, {
    // Should not be hoisted but for some reason it is, blacklisting it manually works
    getDerivedStateFromProps: true,
  })

  return FirestoreProvider
}

export {
  connectFirestore,
  initializeFirebase,
}
