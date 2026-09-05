import{c as r,j as t}from"./index-CQhoep59.js";import{r as c}from"./vendor-BJyTt4PC.js";import{B as i}from"./role-watermark-D7K2REyu.js";import{C as n}from"./check-pxaw7M68.js";/**
 * @license lucide-react v0.395.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=r("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);function y({value:a,...s}){const[o,e]=c.useState(!1);return t.jsx(i,{variant:"ghost",size:"iconSm",onClick:async()=>{try{await navigator.clipboard.writeText(a),e(!0),setTimeout(()=>e(!1),1500)}catch{}},"aria-label":"复制",...s,children:o?t.jsx(n,{className:"h-3.5 w-3.5 text-success"}):t.jsx(p,{className:"h-3.5 w-3.5"})})}export{p as C,y as a};
