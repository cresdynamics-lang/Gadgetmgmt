export type SignInMethod = "PIN" | "PASSWORD" | "BIOMETRIC";
type Policy = { pinAllowed:boolean; passwordAllowed:boolean; biometricsAllowed:boolean };
export function signInAllowed(user:Policy & {role:string},device:Policy,method:SignInMethod|string) {
  if(user.role==="OWNER")return ["PIN","PASSWORD","BIOMETRIC"].includes(method);
  if(method==="PIN")return user.pinAllowed&&device.pinAllowed;
  if(method==="PASSWORD")return user.passwordAllowed&&device.passwordAllowed;
  if(method==="BIOMETRIC")return user.biometricsAllowed&&device.biometricsAllowed;
  return false;
}
