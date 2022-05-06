import { Request } from "express";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import {ValidationChain,validationResult} from "express-validator";
import OB,{Keys,Values,Strings,AppError,AnyBoolean,Enum} from "@onebro/oba-common";
import {Handler,SendReqOpts} from "./middleware-handler-types";

export type ActionResponse = {
  data:Enum<any,string>;
  user?:string;
  auth?:AnyBoolean;
  status?:number;
  token?:string;
};
export const readCert = () => {
  const certFile = path.resolve(__dirname, "ssl/client.crt");
  const keyFile = path.resolve(__dirname, "ssl/client.key");
  const caFile = path.resolve(__dirname, "ssl/ca.cert.pem");
  const SSLCertInfo = {
    cert:fs.readFileSync(certFile),
    key:fs.readFileSync(keyFile),
    passphrase:"password",
    ca:fs.readFileSync(caFile)
  };
  return SSLCertInfo;
};
export const mapUserRole = <R extends Strings>(roles:R,role?:Values<R>) => {
  const keys = Object.keys(roles);
  if(!role) return keys[0];
  else return keys.find(r => roles[r] == role);
};
export const generateTkn = (payload:any,secret:string,opts?:any) => jwt.sign(payload,secret,opts);
export const validateTkn = (token:string,secret:string) => jwt.verify(token,secret);

export const validateApiUser = (cookieName:string,ekey:string,authSecret:string) => {
  const handler:Handler = async (req,res,next) => {
    try{
      const cookie = req.cookies[cookieName] as string;
      const appuser = cookie?OB.decrypt(ekey,cookie):null;
      const header = req.headers.authorization;
      const headerParts = header?.split(" ")||[];
      const validTknFormat = headerParts.length == 2 && ["Bearer","Token"].includes(headerParts[0]) && OB.str(headerParts[1]);
      const token = validTknFormat?validateTkn(headerParts[1],authSecret):null;
      if(!token) throw new AppError({
        message:"Not Authorized",
        status:401
      });
      else {
        req.appuser = appuser;
        req.authtkn = token;
        return next();
      }
    }
    catch(e){return next(e);}
  };
  return handler;
};
export const validateApiUserRole = <R extends Strings>(roles:R) => {
  const handler:Handler = async (req,res,next) => {
    const {role} = req.authtkn;
    const badRole = !Object.keys(roles).includes(role);
    if(badRole) return next(new AppError({message:"unauthorized",status:401}));
    return next();
  };
  return handler;
};
export const validateApiReq = (validators:ValidationChain[]) => {
  const handler:Handler = async (req,res,next) => {
    const errors = validationResult(req);
    if(errors.isEmpty()) return next();
    const extractedErrors:Strings[] = [];
    errors.array().map(err => extractedErrors.push({[err.param]:err.msg}));
    return next({errors:extractedErrors});
  };
  return [...validators,handler];
};
export const handleApiAction = (action:(req:Request) => Promise<ActionResponse>,statusOK:number = 200) => {
  const handler:Handler = async (req,res,next) => {
    try {
      const {user,data,auth} = await action(req);
      res.locals.user = user,
      res.locals.data = data,
      res.locals.auth = auth,
      res.locals.status = statusOK;
      return next();
    }
    catch(e){return next(e);}
  };
  return handler;
};
export const refreshApiUser = (cookieName:string,ekey:string,authSecret:string) => {
  const handler:Handler = async (req,res,next) => {
  try{
      const appuser = res.locals.user||req.appuser;
      const appuserEnc = appuser?OB.encrypt(ekey,appuser):null;
      const token = generateTkn({appuser,okto:"use-api",role:"USER"},authSecret);
      if(appuserEnc) res.cookie(cookieName,appuserEnc,{maxAge:900000,httpOnly:true});
      res.locals.token = res.locals.auth?token:null;
      return next();
    }
    catch(e){return next(e);}
  };
  return handler;
};
export const sendResponse = () => {
  const handler:Handler = async (req,res) => res.status(res.locals.status).json(res.locals);
  return handler;
};
export const sendRequest = async <T>(o:SendReqOpts):Promise<T> => {
  const fetch = (await require("node-fetch")).default;
  try{
    //if(opts.ssl) opts = Object.assign({},opts,{});//SSLCertInfo);//readCert();
    const {url,...opts} = o;
    const res = await fetch(url,opts);
    const data = await res.json() as T;
    if(!res.ok) throw res.text();
    else return data;
  }
  catch(e){OB.error(e.message);throw e;}
};
export type OBNotificationData = {method:string;type:string;user:string;data:any};
export const notifyApiUser = async (o:OBNotificationData,doSend?:boolean|number) => doSend?OB.ok(o):null;