// @flow
import React from 'react'
import hoistNonReactStatics from 'hoist-non-react-statics'
import 'babel-polyfill' // to enable async / await (clear ups the code a lot)

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
      try {
        this.resolveQueryMap(queryMap)
      } catch (e) {
        console.warn('RFC: Were not able to resolve query map correctly! Error details:', e)
      }
    }
    componentDidUpdate = (prevProps: Object) => {
      if (prevProps === this.props) {
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
      Object.entries(queryMap).forEach(async ([property, query]: [string, any]) => {
        const shouldUpdateResult = await this.shouldUpdateResult(property, query)
        if (!shouldUpdateResult) {
          return
        }
        if (Array.isArray(query)) {
          if (type !== 'once') {
            const {
              references: {
                [property]: referencesArray,
              },
            } = this.state
            // eslint-disable-next-line no-unused-expressions
            referencesArray && referencesArray.forEach(reference => reference && reference())
          }
          // Clear state first
          this.setState(state => ({
            results: {
              ...state.results,
              [property]: null,
            },
          }),
          () => // After clearing state, update the prop with correct data
            query.forEach(async (docRef, index) => (
              type === 'once'
                ? this.resolveGetQuery(await docRef, property, true, index)
                : this.resolveRealTimeQuery(await docRef, property, true, index)
            ))
          )
        } else {
          const docRef = await query // In case of async passed in
          if (type !== 'once') {
            const {
              references: {
                [property]: reference,
              },
            } = this.state
            // eslint-disable-next-line no-unused-expressions
            reference && reference()
            this.resolveRealTimeQuery(docRef, property)
          } else {
            this.resolveGetQuery(docRef, property)
          }
        }
      })
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
              return reference.forEach(ref => ref && ref())
            }
            // $FlowFixMe
            return reference && reference() // this unsubscribes given reference
          }
        )
      }
    }
    resolveQueryMap = (queryMap: QueryMap) => {
      Object.entries(queryMap).forEach(
        // Type should be [string, Promise<any>], but flow cannot deal with Object.entries
        // see issue https://github.com/facebook/flow/issues/2221
        async ([property, query]: [string, any]) => {
          // Checks whether it is array of docRefs or just one docRef
          if (Array.isArray(query)) {
            return query.map(async (potentialDocRef, index) => {
              const docRef = await potentialDocRef // In case of async function passed in
              return type === 'once'
                ? this.resolveGetQuery(docRef, property, true, index)
                : this.resolveRealTimeQuery(docRef, property, true, index)
            })
          }
          const docRef = await query // In case of async function passed in
          return type === 'once'
            ? this.resolveGetQuery(docRef, property)
            : this.resolveRealTimeQuery(docRef, property)
        }
      )
    }
    resolveGetQuery = (docRef: Object, property: string, isArray?: boolean, index?: number) => {
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
          .then(data => this.updateResults(data, property, isArray, index))
      } else {
        // If user sends object or some other type data down the component, just update that
        // DocRef is `any` type
        this.updateResults(docRef, property, isArray, index)
      }
    }

    resolveRealTimeQuery = (
      docRef: Object,
      property: string,
      isArray?: boolean,
      index?: number
    ) => {
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
              this.updateResults(data, property, isArray, index)
            } else {
              // Otherwise, it is doc - save snapshot of the doc itself.
              // Renamed for clarity.
              const doc = querySnapshot
              const data = doc.exists ? ({
                id: doc.id,
                ...doc.data(),
              }) : null
              this.updateResults(data, property, isArray, index)
            }
          })
        // Store the reference, so when unmounting we can cancel the listener
        this.updateReferences(reference, property, isArray, index)
        return reference
      }
      // If user sends object or some other type data down the component, just update that
      // DocRef is `any` type
      return this.updateResults(docRef, property, isArray, index)
    }

    updateResults = (data: any, property: string, isArray?: boolean, index?: number) => {
      this.setState((state) => {
        if (!isArray) {
          return ({
            results: {
              ...state.results,
              [property]: data,
            },
          })
        }
        const dataInCorrectFormat = state.results[property] || []
        // $FlowFixMe - Store data on exactly the index in which order queries were sent
        dataInCorrectFormat[index] = data

        return ({
          results: {
            ...state.results,
            [property]: dataInCorrectFormat,
          },
        })
      })
    }

    updateReferences = (
      reference: Function,
      property: string,
      isArray?: boolean,
      index?: number) => {
      this.setState((state) => {
        if (!isArray) {
          return ({
            references: {
              ...state.references,
              [property]: reference,
            },
          })
        }
        const referenceInCorrectFormat = state.references[property] || []
        // $FlowFixMe - Store the reference on exactly the index in which order queries were sent
        referenceInCorrectFormat[index] = reference

        return ({
          references: {
            ...state.references,
            [property]: referenceInCorrectFormat,
          },
        })
      })
    }

    shouldUpdateResult = async (property: string, query: any) => {
      let shouldUpdate = false
      const {
        results,
      } = this.state
      const propertyInState = results[property]
      if (Array.isArray(query)) {
        query.forEach(async (potentialDocRef, index) => {
          const previousDoc = propertyInState && propertyInState[index]
          const previousDocId = previousDoc && previousDoc.id
          const docRef = await potentialDocRef // In case async function was provided
          if (docRef.id !== previousDocId) {
            shouldUpdate = true
          }
        })
        const previousArrayLength = propertyInState && propertyInState.length
        if (query.length !== previousArrayLength) {
          shouldUpdate = true
        }
        return shouldUpdate
      }
      const previousDocId = propertyInState && propertyInState.id
      const docRef = await query // In case async function was provided
      // If it doesn't have id, it is query => we have no way of checking
      // Whether query results changed, therefore just refresh it if it is query
      return docRef && (docRef.id !== previousDocId || !docRef.id)
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
