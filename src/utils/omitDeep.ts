type Path = Array<string | number>;
type Paths = Path | Path[];

/**
 * Removes properties from an object at specified paths.
 * @param obj The target object.
 * @param paths The paths of the properties to remove.
 * @returns A new object with the properties removed.
 *
 * @example
 * const user = {
 *   id: 1,
 *   name: 'John',
 *   profile: {
 *     email: 'john@example.com',
 *     settings: {
 *       theme: 'dark',
 *       notifications: true
 *     }
 *   },
 *   tags: ['user', 'premium', 'verified']
 * };
 *
 * // Remove a single nested property
 * const withoutEmail = omitDeep(user, ['profile', 'email']);
 *
 * // Remove multiple properties and array elements at once
 * const cleanedUser = omitDeep(user, [
 *   ['profile', 'email'],
 *   ['profile', 'settings', 'notifications'],
 *   ['tags', 1] // Remove the second element of the array
 * ]);
 */
function omitDeep<T extends object>(obj: T, paths: Paths): T {
  // Robust deep copy
  const deepClone = <U>(item: U): U => {
    if (item === null || typeof item !== 'object') return item;

    if (item instanceof Date) return new Date(item) as unknown as U;
    if (item instanceof RegExp) return new RegExp(item) as unknown as U;

    if (Array.isArray(item)) {
      return item.map(deepClone) as unknown as U;
    }

    const clone = {} as U;
    for (const key in item) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        clone[key] = deepClone(item[key]);
      }
    }
    return clone;
  };

  const result = deepClone(obj);

  // Normalize paths
  const pathArray: Path[] =
    Array.isArray(paths) && paths.length > 0 && Array.isArray(paths[0]) ? (paths as Path[]) : [paths as Path];

  // Perform deletion for each path
  for (const path of pathArray) {
    if (path.length === 0) continue;

    // Get the parent object/array of the target property
    const parentInfo = getParentAndKey(result, path);
    if (!parentInfo) continue;

    const { parent, lastKey } = parentInfo;

    // Delete the property or array element
    if (Array.isArray(parent)) {
      // If it's an array
      const index = Number(lastKey);
      if (!isNaN(index) && index >= 0 && index < parent.length) {
        parent.splice(index, 1);
      }
    } else if (typeof parent === 'object' && parent !== null) {
      // If it's an object
      delete parent[lastKey as string];
    }
  }

  return result;
}

/**
 * Gets the parent object/array and the final key for a given path.
 */
function getParentAndKey(obj: any, path: Path): { parent: any; lastKey: string | number } | null {
  let current: any = obj;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];

    if (current === null || typeof current !== 'object') {
      return null;
    }

    // Handle arrays
    if (Array.isArray(current)) {
      const index = Number(key);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return null;
      }
      current = current[index];
    } // Handle objects
    else if (Object.prototype.hasOwnProperty.call(current, key!)) {
      current = current[key!];
    } else {
      return null;
    }
  }

  if (current === null || typeof current !== 'object') {
    return null;
  }

  return {
    parent: current,
    lastKey: path[path.length - 1]!,
  };
}

export default omitDeep;
