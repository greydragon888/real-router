type NetworkConnection =
  | { saveData?: boolean; effectiveType?: string }
  | undefined;

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkConnection;
}

export function isSlowConnection(): boolean {
  const connection = (navigator as NavigatorWithConnection).connection;

  if (!connection) {
    return false;
  }
  if (connection.saveData) {
    return true;
  }
  if (connection.effectiveType?.includes("2g")) {
    return true;
  }

  return false;
}
