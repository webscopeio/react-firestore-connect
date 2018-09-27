export const getAllUsers = async (db: Object) => db
  .collection('names')

export const getAllUsersOrdered = async (db: Object) => db
  .collection('names')
  .orderBy('firstName')

export const getUserById = async (db: Object, id: string) => db
  .collection('names')
  .doc(id)

export const getUserByFirstName = async (db: Object, name: string) => db
  .collection('names')
  .where('firstName', '==', name)

export const getThreeUsersOrdered = async (db: Object) => db
  .collection('names')
  .orderBy('firstName')
  .limit(3)
