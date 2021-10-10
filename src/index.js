// @flow
/* eslint-disable no-underscore-dangle */
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
let errorHandler: Function = console.error

function initializeFirebase(firebaseInstance: any, optionalHandler?: Function) {
  firebase = firebaseInstance
  errorHandler = optionalHandler || errorHandler
}

const getPath = (ref: Object) => {
  const { parent, id = '' } = ref
  return parent ? `${getPath(parent)}/${id}` : id
}

const connectFirestore = (
  queryMapFn: (db: Object, props: *, uid: string | null) => QueryMap,
  ComposedComponent: any,
) => {
  class FirestoreProvider extends React.Component<any, State> {
    state = {
      results: {},
      references: {},
    }

    componentDidMount = async () => {
      try {
        if (!firebase) {
          throw Error('No firebase instance provided! Please make sure that you invoked initializeFirebase() with the correct firebase instance in the root of your application!')
        }

        const { currentUser } = firebase.auth()

        const database = firebase.firestore()
        const userId = currentUser ? currentUser.uid : null
        const queryMap = queryMapFn(database, this.props, userId)
        await this.resolveQueryMap(queryMap)
      } catch (error) {
        errorHandler(error)
      }
    }

    componentDidUpdate = async (prevProps: Object) => {
      if (prevProps === this.props) {
        return
      }

      try {
        const { currentUser } = firebase.auth()

        const database = firebase.firestore()
        const userId = currentUser ? currentUser.uid : null
        const queryMap = queryMapFn(database, this.props, userId)
        const prevQueryMap = queryMapFn(database, prevProps, userId)
        await Promise.all(Object.entries(queryMap).map(async ([property, query]: [string, any]) => {
          const shouldUpdateResult = await this.shouldUpdateResult(
            property,
            query,
            prevQueryMap[property],
          )
          if (!shouldUpdateResult) {
            return
          }

          if (Array.isArray(query)) {
            const {
              references: {
                [property]: referencesArray,
              },
            } = this.state

            if (referencesArray) {
              referencesArray.forEach((reference) => {
                if (reference) {
                  reference()
                }
              })
            }

            // If query is empty, store empty array on the property
            if (!query.length) {
              this.updateResults(null, property, true, undefined, true)
            } else {
              await Promise.all(query.map(async (potentialDocRef, index) => {
                const docRef = await potentialDocRef // In case of async function passed in
                return this.resolveRealTimeQuery(docRef, property, true, index)
              }))
            }
          } else {
            const docRef = await query // In case of async passed in
            const {
              references: {
                [property]: reference,
              },
            } = this.state

            if (reference) {
              reference()
            }

            this.resolveRealTimeQuery(docRef, property)
          }
        }))
      } catch (error) {
        errorHandler(error)
      }
    }

    componentWillUnmount = () => {
      try {
        // If type of connection is real time, unsubscribe listener for the data
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
      } catch (error) {
        errorHandler(error)
      }
    }

    resolveQueryMap = async (queryMap: QueryMap) =>
      Promise.all(Object.entries(queryMap).map(
        // Type should be [string, Promise<any>], but flow cannot deal with Object.entries
        // see issue https://github.com/facebook/flow/issues/2221
        async ([property, query]: [string, any]) => {
          // Checks whether it is array of docRefs or just one docRef
          if (Array.isArray(query)) {
            // If query is empty, store empty array on the property
            if (!query.length) {
              this.updateResults(null, property, true, undefined, true)
            } else {
              return Promise.all(query.map(async (potentialDocRef, index) => {
                const docRef = await potentialDocRef // In case of async function passed in
                return this.resolveRealTimeQuery(docRef, property, true, index)
              }))
            }
          }
          const docRef = await query // In case of async function passed in
          return this.resolveRealTimeQuery(docRef, property)
        }
      ))

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
          }, error => errorHandler(error, { property, path: getPath(docRef) }))
        // Store the reference, so when unmounting we can cancel the listener
        this.updateReferences(reference, property, isArray, index)
        return reference
      }
      // If user sends object or some other type data down the component, just update that
      // DocRef is `any` type
      return this.updateResults(docRef, property, isArray, index)
    }

    updateResults = (
      data: any,
      property: string,
      isArray?: boolean,
      index?: number,
      isEmpty?: boolean, // Only for arrays - if array is empty, store empty array as a result
    ) => {
      this.setState((state) => {
        if (!isArray) {
          return ({
            results: {
              ...state.results,
              [property]: data,
            },
          })
        }
        if (isEmpty) {
          return ({
            results: {
              ...state.results,
              [property]: [],
            },
          })
        }
        // Create new instance to avoid not rerendering when using React.memo or PureComponent
        const dataInCorrectFormat = [...(state.results[property] || [])]
        // $FlowFixMe - Store data on exactly the index in which order queries were sent
        dataInCorrectFormat[index] = Array.isArray(data)
          // Create new instance to avoid not rerendering when using React.memo or PureComponent
          ? [...data]
          : typeof data === 'object'
            // Create new instance to avoid not rerendering when using React.memo or PureComponent
            ? { ...data }
            : data

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
        const referenceInCorrectFormat = [...(state.references[property] || [])]

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

    shouldUpdateResult = async (property: string, query: any, prevQuery: any) => {
      let shouldUpdate = false
      const {
        results,
      } = this.state
      const propertyInState = results[property]
      if (Array.isArray(query)) {
        await Promise.all(query.map(async (potentialDocRef, index) => {
          const previousDoc = propertyInState && propertyInState[index]
          const previousDocId = previousDoc && previousDoc.id
          const docRef = await potentialDocRef // In case async function was provided
          if (docRef && docRef.id !== previousDocId) {
            shouldUpdate = true
          }
        }))
        const previousArrayLength = propertyInState && propertyInState.length
        if (query.length !== previousArrayLength) {
          shouldUpdate = true
        }
        return shouldUpdate
      }

      // Query is "where" query if result of query is an array (.where(prop, '==', value))
      // Note - this only returns array after first successful fetch
      const isFetchedWhereQuery = Array.isArray(propertyInState)

      if (isFetchedWhereQuery) {
        // This works up to certain firestore version on web sdk
        if (query._query && prevQuery._query) {
          // We don't update where queries unless something changed - this returns query in format
          // of "Query(collectionName, filters: [condition1 (prop == value), condition2...])"
          // therefore we can just compare them as they are string
          return query._query.toString() !== prevQuery._query.toString()
        }
        try {
          // Unfortunately on react-native-firebase / possibly newer firebase versions we cannot
          // check _query object, so whether collection path / modifiers changed, if not query
          // is the same
          const equalModifiers = JSON.stringify(query._modifiers)
            === JSON.stringify(prevQuery._modifiers)
          const equalCollectionPath = JSON.stringify(query._collectionPath)
            === JSON.stringify(prevQuery._collectionPath)
          // If both of them are equal, don't update - query did not change
          return !(equalModifiers && equalCollectionPath)
        } catch (error) {
          // If this crashes for some reason, always reload the query to be on the safe side
          errorHandler(error)
          return true
        }
      }

      const previousDocId = propertyInState && propertyInState.id
      const docRef = await query // In case async function was provided
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
