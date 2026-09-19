import{c as i,a as y}from"./index-B7k5yxGG.js";import{r as a}from"./vendor-CXBObVrp.js";/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=i("Pencil",[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}],["path",{d:"m15 5 4 4",key:"1mk7zo"}]]);/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const P=i("Plus",[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]]);function g(){const t=y(),[c,n]=a.useState(null),u=a.useRef(new Set),o=a.useCallback(async(e,h,s={})=>{var l;if(u.current.has(e))return!1;u.current.add(e),n(e);try{return await h(),(l=s.refresh)!=null&&l.length&&await Promise.all(s.refresh.map(r=>r())),s.success&&t.success(s.success.title,s.success.description),!0}catch(r){return t.error(s.errorTitle??"操作失败",r instanceof Error?r.message:String(r)),!1}finally{u.current.delete(e),n(null)}},[t]),f=a.useCallback(e=>c===e,[c]);return{run:o,isBusy:f,busyKey:c}}export{P,p as a,g as u};
