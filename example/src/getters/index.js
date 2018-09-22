export const getAllUsers = (db: Object) => db
  .collection('names')

export const getAllUsersOrdered = (db: Object) => db
  .collection('names')
  .orderBy('firstName')

export const getUserById = (db: Object, id: string) => db
  .collection('names')
  .doc(id)

export const getUserByFirstName = (db: Object, name: string) => db
  .collection('names')
  .where('firstName', '==', name)

export const getThreeUsersOrdered = (db: Object) => db
  .collection('names')
  .orderBy('firstName')
  .limit(3)
