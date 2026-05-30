const n=(e=new Date)=>{const t=e.getTimezoneOffset()*6e4;return new Date(e.getTime()-t).toISOString().split("T")[0]};export{n as g};
