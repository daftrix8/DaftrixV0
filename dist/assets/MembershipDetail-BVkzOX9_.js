import{r as b,a as t}from"./react-vendor-BIDOXFPG.js";import{B as J,aL as ee,t as ie,aK as w,a as P}from"./index-IBFziwL2.js";import{a as te}from"./query-vendor-CgIICZoo.js";import{u as oe}from"./useAlert-C5FFod2J.js";import{t as se}from"./browser-BiSx3Vix.js";import{av as re,aA as A,ao as z,cB as j,az as T,O as U,X as O,a1 as G,d as le,Y as D,l as B,aG as ne,V as de,e as ae}from"./icons-vendor-DaeaA4tz.js";import{f as V}from"./format-B7HFsDA2.js";import"./export-libs-BvadkuZN.js";import"./socket-vendor-TjCxX7sJ.js";import"./motion-vendor-Cm2TDenC.js";import"./Modal-BYLpGxrb.js";const s=e=>{const a={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"};return e.replace(/[&<>"']/g,l=>a[l]||l)},m=e=>{if(!e)return"---";try{const a=new Date(e);return`${a.getUTCFullYear()}/${String(a.getUTCMonth()+1).padStart(2,"0")}/${String(a.getUTCDate()).padStart(2,"0")}`}catch{return"---"}},pe=`
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="8" r="4"/>
        <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
    </svg>
`,g=(e,a,l,o)=>e.customerPhoto?`<img src="${e.customerPhoto}" style="width:100%;height:100%;object-fit:cover;" />`:`
        <div style="width:100%;height:100%;background:${l};display:flex;align-items:center;justify-content:center;color:${o};">
            ${pe}
        </div>
    `,f=async(e,a=100,l)=>{try{return await se(e,{width:a,margin:0,color:{dark:l?.darkColor||"#000000ff",light:l?.lightColor||"#ffffffff"}})}catch{return""}},xe=async e=>{const a=await f(e.memberId,56,{darkColor:"#E87A1Eff",lightColor:"#0a0a0aff"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i="#E87A1E",r=`
        <div class="card" style="background:#0a0a0a; color:#fff; font-family:'Orbitron','Cairo',sans-serif; border:1px solid #1a1a1a;">
            <!-- Background tech texture -->
            <div style="position:absolute;inset:0;opacity:0.04;background-image:linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%), linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%);background-size:10px 10px;background-position:0 0, 5px 5px;"></div>
            
            <!-- Left & Right edge border lines -->
            <div style="position:absolute; top:10px; bottom:10px; left:8px; border-left:1.5px solid ${i}; opacity:0.8;"></div>
            <div style="position:absolute; top:10px; bottom:10px; right:8px; border-right:1.5px solid ${i}; opacity:0.8;"></div>
            
            <!-- Top/Bottom edge corner brackets -->
            <div style="position:absolute; top:10px; left:8px; width:10px; border-top:1.5px solid ${i}; opacity:0.8;"></div>
            <div style="position:absolute; bottom:10px; left:8px; width:10px; border-bottom:1.5px solid ${i}; opacity:0.8;"></div>
            <div style="position:absolute; top:10px; right:8px; width:10px; border-top:1.5px solid ${i}; opacity:0.8;"></div>
            <div style="position:absolute; bottom:10px; right:8px; width:10px; border-bottom:1.5px solid ${i}; opacity:0.8;"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding: 20px 20px 30px 16px;">
                <!-- FAR LEFT: Vertical Text -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="2.5"><path d="M4 8l8-4 8 4M4 16l8 4 8-4"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:${i}; font-size:8px; font-weight:800; letter-spacing:4px;">VIP MEMBER</div>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="2.5"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg>
                </div>

                <!-- CENTER-LEFT: Photo Box -->
                <div style="width:72px; height:72px; border:1.5px solid ${i}; margin-left:8px; margin-top:14px; flex-shrink:0;">
                    ${g(e,i,"transparent",i)}
                </div>

                <!-- CENTER-RIGHT: Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <!-- change font-size:10px → 13px, add a subtle separator below -->
                    <div style="color:${i}; font-size:13px; font-weight:900; letter-spacing:3px; text-transform:uppercase; text-align:center; margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid ${i}44;">${l}</div>
                    
                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid ${i}; padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:#fff; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        </div>
                        <div style="font-size:6px; color:#fff; width:55px; letter-spacing:1px; font-weight:600;">MEMBER ID</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Branch -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid ${i}; padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:#fff; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
                        </div>
                        <div style="font-size:6px; color:#fff; width:55px; letter-spacing:1px; font-weight:600;">BRANCH ACCESS</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">ALL BRANCHES</div>
                    </div>

                    <!-- Row 3: Level -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid ${i}; padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20h20l-2-8-4 4-4-6-4 6-4-4-2 8z"/></svg>
                        </div>
                        <div style="font-size:6px; color:${i}; width:55px; letter-spacing:1px; font-weight:600;">ACCESS LEVEL</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:${i}; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 4: Valid -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid ${i}; padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:#fff; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <div style="font-size:6px; color:#fff; width:55px; letter-spacing:1px; font-weight:600;">VALID UNTIL</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1.5px solid ${i}; height:14px; margin-top:2px;"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;filter:brightness(1.5);" />`:`<div style="font-size:8px;font-weight:900;color:${i};text-align:center;margin-bottom:12px;">${o}</div>`}
                    <div style="background:#0a0a0a; border:1px solid ${i}; padding:2px; border-radius:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:${i}; font-size:5px; font-weight:800; letter-spacing:1px; margin-top:4px;">SCAN HERE</div>
                </div>
            </div>

            <!-- Bottom footer -->
            <div style="position:absolute; bottom:12px; left:0; right:0; display:flex; justify-content:center; align-items:center; gap:6px;">
                <span style="font-size:5px; color:#666; font-weight:700; letter-spacing:1.5px;">BUILT THROUGH LOYALTY</span>
                ${e.companyLogo?`<img src="${e.companyLogo}" style="height:10px; opacity:0.6; filter:grayscale(1);"/>`:`<span style="color:${i}; font-size:6px;">◆</span>`}
                <span style="font-size:5px; color:#666; font-weight:700; letter-spacing:1.5px;">${o} SINCE 2016 - ${new Date().getFullYear()}</span>
            </div>
        </div>
    `,p=`
        <div class="card" style="background:#0a0a0a; color:#fff; font-family:'Orbitron','Cairo',sans-serif; border:1px solid #1a1a1a;">
            <!-- Background tech texture -->
            <div style="position:absolute;inset:0;opacity:0.04;background-image:linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%), linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%);background-size:10px 10px;background-position:0 0, 5px 5px;"></div>
            
            <!-- Left & Right edge border lines -->
            <div style="position:absolute; top:10px; bottom:10px; left:8px; border-left:1.5px solid ${i}; opacity:0.8;"></div>
            <div style="position:absolute; top:10px; bottom:10px; right:8px; border-right:1.5px solid ${i}; opacity:0.8;"></div>
            
            <div style="position:absolute; top:10px; left:8px; width:10px; border-top:1.5px solid ${i}; opacity:0.8;"></div>
            <div style="position:absolute; bottom:10px; left:8px; width:10px; border-bottom:1.5px solid ${i}; opacity:0.8;"></div>
            <div style="position:absolute; top:10px; right:8px; width:10px; border-top:1.5px solid ${i}; opacity:0.8;"></div>
            <div style="position:absolute; bottom:10px; right:8px; width:10px; border-bottom:1.5px solid ${i}; opacity:0.8;"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:5px;">
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:60px;max-height:36px;object-fit:contain;filter:brightness(1.5);margin-bottom:4px;" />`:""}
                <div style="font-size:18px;font-weight:900;color:${i};line-height:1;letter-spacing:1px;">${o}</div>
                <div style="font-size:8px;color:#888;letter-spacing:5px;font-weight:700;">MEMBERS CLUB</div>
                <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,${i},transparent);margin:3px 0;"></div>
                <div style="font-size:6px;color:#555;letter-spacing:3px;">FOR LEGENDS ONLY</div>
                
                <div style="margin-top:12px;">
                    <div style="font-size:6px;color:#555;font-family:'Cairo',sans-serif;">التوقيع والختم</div>
                    <div style="width:100px;border-bottom:1px solid #333;margin-top:6px;"></div>
                </div>
            </div>

            <!-- Bottom footer -->
            <div style="position:absolute; bottom:12px; left:0; right:0; display:flex; justify-content:center; align-items:center;">
                <span style="font-size:5px; color:#666; font-weight:700; letter-spacing:2px;">${e.companyPhone?s(e.companyPhone)+" — ":""}EARNED. NOT GIVEN.</span>
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${r}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${p}`},me=async e=>{const a=await f(e.memberId,56,{darkColor:"#c8973aff",lightColor:"#0a1628ff"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i="#c8973a",r="#0a1628",p=`
        <div class="card" style="background:linear-gradient(135deg, ${r} 0%, #0f1d36 100%); color:#fff; font-family:'Playfair Display','Cairo',serif;">
            <!-- Double gold border frame -->
            <div style="position:absolute;inset:5px;border:1.5px solid rgba(200,151,58,0.5);border-radius:10px;"></div>
            <div style="position:absolute;inset:9px;border:1px solid rgba(200,151,58,0.15);border-radius:8px;"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Vertical text sidebar -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="${i}" stroke="none"><path d="M2 20h20l-2-8-4 4-4-6-4 6-4-4-2 8z"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:${i}; font-size:7px; font-weight:700; letter-spacing:4px; font-family:'Inter',sans-serif;">EXCLUSIVE</div>
                    <div style="color:${i}; font-size:6px;">◆</div>
                </div>

                <!-- Photo Box -->
                <div style="width:72px; height:72px; border:1.5px solid ${i}; border-radius:6px; overflow:hidden; margin-left:8px; margin-top:14px; flex-shrink:0; box-shadow:0 0 12px rgba(200,151,58,0.15);">
                    ${g(e,i,r,i)}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:${i}; font-size:13px; font-weight:700; letter-spacing:2px; text-transform:uppercase; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(200,151,58,0.3); font-family:'Playfair Display',serif;">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(200,151,58,0.25); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center;">◆</div>
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600; font-family:'Inter',sans-serif;">MEMBER ID</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#f0e6d0; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(200,151,58,0.25); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center;">◆</div>
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600; font-family:'Inter',sans-serif;">ACCESS LEVEL</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:${i}; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(200,151,58,0.25); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center;">◆</div>
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600; font-family:'Inter',sans-serif;">VALID UNTIL</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#f0e6d0; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid rgba(200,151,58,0.3); height:14px; margin-top:2px; border-radius:2px;"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;" />`:`<div style="font-size:8px;font-weight:700;color:${i};text-align:center;margin-bottom:12px;">${o}</div>`}
                    <div style="background:rgba(200,151,58,0.08); border:1px solid rgba(200,151,58,0.3); padding:2px; border-radius:3px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:${i}; font-size:5px; font-weight:700; letter-spacing:1px; margin-top:4px; font-family:'Inter',sans-serif;">VERIFY</div>
                </div>
            </div>

            <!-- Bottom footer bar -->
            <div style="position:absolute;bottom:0;left:0;right:0;height:14px;background:linear-gradient(90deg,${i},#b8922f);display:flex;align-items:center;justify-content:center;border-radius:0 0 14px 14px;">
                <span style="font-size:5px;font-weight:800;color:${r};letter-spacing:3px;font-family:'Inter',sans-serif;">${o} — PREMIUM CLUB</span>
            </div>
        </div>
    `,x=`
        <div class="card" style="background:linear-gradient(135deg, ${r} 0%, #0f1d36 100%); color:#fff; font-family:'Playfair Display','Cairo',serif;">
            <div style="position:absolute;inset:5px;border:1.5px solid rgba(200,151,58,0.5);border-radius:10px;"></div>
            <div style="position:absolute;inset:9px;border:1px solid rgba(200,151,58,0.15);border-radius:8px;"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 14px);text-align:center;gap:5px;">
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:34px;object-fit:contain;margin-bottom:2px;" />`:""}
                <div style="font-size:18px;font-weight:700;color:${i};letter-spacing:1px;">${o}</div>
                <div style="font-size:8px;color:#7a8baa;letter-spacing:5px;font-weight:600;font-family:'Inter',sans-serif;">MEMBERS CLUB</div>
                <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,${i},transparent);margin:3px 0;"></div>
                <div style="font-size:6px;color:#4a5a78;letter-spacing:2px;font-family:'Inter',sans-serif;">EXCELLENCE RECOGNIZED</div>
                <div style="margin-top:10px;">
                    <div style="font-size:5px;color:#4a5a78;font-family:'Cairo',sans-serif;">التوقيع والختم</div>
                    <div style="width:100px;border-bottom:1px solid rgba(200,151,58,0.3);margin-top:6px;"></div>
                </div>
            </div>

            <div style="position:absolute;bottom:0;left:0;right:0;height:14px;background:linear-gradient(90deg,${i},#b8922f);display:flex;align-items:center;justify-content:center;border-radius:0 0 14px 14px;">
                <span style="font-size:5px;font-weight:800;color:${r};letter-spacing:3px;font-family:'Inter',sans-serif;">${e.companyPhone?s(e.companyPhone)+" — ":""}${o}</span>
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${p}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${x}`},fe=async e=>{const a=await f(e.memberId,56,{darkColor:"#ffffffff",lightColor:"#00000000"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i=`
        <div class="card" style="background:linear-gradient(135deg, #7c3aed 0%, #3b82f6 50%, #06b6d4 100%); color:#fff; font-family:'Inter','Cairo',sans-serif;">
            <!-- Glass overlay -->
            <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0.1) 0%,rgba(255,255,255,0) 50%);pointer-events:none;"></div>
            <!-- Decorative circles -->
            <div style="position:absolute;top:-20px;right:-20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.08);"></div>
            <div style="position:absolute;bottom:-30px;left:-10px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,0.05);"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Vertical text sidebar -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:rgba(255,255,255,0.9); font-size:7px; font-weight:800; letter-spacing:4px;">PREMIUM</div>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </div>

                <!-- Photo Box -->
                <div style="width:72px; height:72px; border:2px solid rgba(255,255,255,0.4); border-radius:10px; overflow:hidden; margin-left:8px; margin-top:14px; flex-shrink:0; box-shadow:0 4px 16px rgba(0,0,0,0.2); background:rgba(255,255,255,0.1);">
                    ${g(e,"#fff","rgba(255,255,255,0.1)","rgba(255,255,255,0.6)")}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:#fff; font-size:13px; font-weight:900; letter-spacing:2px; text-transform:uppercase; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.25);">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:rgba(255,255,255,0.7); display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        </div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.6); width:55px; letter-spacing:1px; font-weight:600;">MEMBER ID</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.4); width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:rgba(255,255,255,0.7); display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20h20l-2-8-4 4-4-6-4 6-4-4-2 8z"/></svg>
                        </div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.6); width:55px; letter-spacing:1px; font-weight:600;">ACCESS LEVEL</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.4); width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:rgba(255,255,255,0.7); display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.6); width:55px; letter-spacing:1px; font-weight:600;">VALID UNTIL</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.4); width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid rgba(255,255,255,0.2); height:14px; margin-top:2px; border-radius:4px; background:rgba(255,255,255,0.05);"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;filter:brightness(1.3);" />`:`<div style="font-size:8px;font-weight:800;color:#fff;text-align:center;margin-bottom:12px;">${o}</div>`}
                    <div style="background:rgba(255,255,255,0.15); border-radius:6px; padding:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:rgba(255,255,255,0.6); font-size:5px; font-weight:700; letter-spacing:1px; margin-top:4px;">SCAN</div>
                </div>
            </div>

            <!-- Bottom footer -->
            <div style="position:absolute; bottom:10px; left:0; right:0; display:flex; justify-content:center;">
                <span style="font-size:5px; color:rgba(255,255,255,0.4); font-weight:700; letter-spacing:2px;">${o} • PREMIUM ACCESS</span>
            </div>
        </div>
    `,r=`
        <div class="card" style="background:linear-gradient(135deg, #7c3aed 0%, #3b82f6 50%, #06b6d4 100%); color:#fff; font-family:'Inter','Cairo',sans-serif;">
            <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0.1) 0%,rgba(255,255,255,0) 50%);pointer-events:none;"></div>
            <div style="position:absolute;top:-20px;left:-20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.08);"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:5px;">
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:32px;object-fit:contain;filter:brightness(1.3);" />`:""}
                <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:1px;">${o}</div>
                <div style="font-size:8px;color:rgba(255,255,255,0.6);letter-spacing:5px;font-weight:600;">MEMBERS CLUB</div>
                <div style="width:50px;height:2px;background:rgba(255,255,255,0.4);border-radius:1px;margin:2px 0;"></div>
                <div style="font-size:6px;color:rgba(255,255,255,0.5);letter-spacing:2px;">YOUR JOURNEY STARTS HERE</div>
                <div style="margin-top:10px;">
                    <div style="font-size:5px;color:rgba(255,255,255,0.4);font-family:'Cairo',sans-serif;">التوقيع والختم</div>
                    <div style="width:100px;border-bottom:1px solid rgba(255,255,255,0.2);margin-top:6px;"></div>
                </div>
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${i}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${r}`},ce=async e=>{const a=s(e.memberName),l=s(e.companyName),o=s(e.packageName),n=e.themeColor||"#0f766e",i=await f(e.memberId,56,{darkColor:n+"ff",lightColor:"#ffffffff"}),r=`
        <div class="card" style="background:#fafafa; color:#1e293b; font-family:'Inter','Cairo',sans-serif; border:1px solid #e2e8f0; box-shadow:inset 0 2px 6px rgba(0,0,0,0.04);">
            <!-- Accent top bar -->
            <div style="position:absolute;top:0;left:0;right:0;height:6px;background:${n};border-radius:14px 14px 0 0;"></div>

            <div style="position:relative;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Company branding vertical -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <div style="width:8px;height:8px;border-radius:50%;background:${n};"></div>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:${n}; font-size:7px; font-weight:800; letter-spacing:4px;">MEMBER</div>
                    <div style="width:1px;height:12px;background:${n};opacity:0.3;"></div>
                </div>

                <!-- Photo Box -->
                <div style="width:72px; height:72px; border:1.5px solid ${n}; border-radius:6px; overflow:hidden; margin-left:8px; margin-top:14px; flex-shrink:0;">
                    ${g(e,n,"#f1f5f9",n)}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:#0f172a; font-size:13px; font-weight:900; letter-spacing:1px; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid #e2e8f0;">${a}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${n}; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        </div>
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600;">رقم العضوية</div>
                        <div style="font-size:6px; color:${n}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${n}; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20h20l-2-8-4 4-4-6-4 6-4-4-2 8z"/></svg>
                        </div>
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600;">الباقة</div>
                        <div style="font-size:6px; color:${n}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:${n}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${o}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid #e2e8f0; padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${n}; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600;">صالح حتى</div>
                        <div style="font-size:6px; color:${n}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#334155; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid #e2e8f0; height:14px; margin-top:2px; border-radius:2px;"></div>
                </div>

                <!-- RIGHT: QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;" />`:`<div style="font-size:8px;font-weight:800;color:${n};text-align:center;margin-bottom:12px;">${l}</div>`}
                    <div style="border:1px solid #e2e8f0; border-radius:4px; padding:2px;">
                        <img src="${i}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                </div>
            </div>

            <!-- Bottom footer -->
            <div style="position:absolute; bottom:10px; left:0; right:0; display:flex; justify-content:center;">
                <span style="font-size:5px; color:#94a3b8; font-weight:700; letter-spacing:2px;">${l} • MEMBERSHIP CARD</span>
            </div>
        </div>
    `,p=`
        <div class="card" style="background:#fafafa; color:#1e293b; font-family:'Inter','Cairo',sans-serif; border:1px solid #e2e8f0;">
            <div style="position:absolute;top:0;left:0;right:0;height:6px;background:${n};border-radius:14px 14px 0 0;"></div>

            <div style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:5px;">
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:34px;object-fit:contain;" />`:`<div style="font-size:18px;font-weight:900;color:${n};">${l}</div>`}
                <div style="font-size:8px;color:#94a3b8;letter-spacing:3px;font-weight:600;">MEMBERSHIP CARD</div>
                <div style="width:40px;height:1px;background:#e2e8f0;margin:2px 0;"></div>
                <div style="font-size:6px;color:#94a3b8;font-family:'Cairo',sans-serif;">بطاقة عضوية</div>
                <div style="margin-top:12px;">
                    <div style="font-size:5px;color:#94a3b8;font-family:'Cairo',sans-serif;">التوقيع والختم</div>
                    <div style="width:100px;border-bottom:1px solid #e2e8f0;margin-top:6px;"></div>
                </div>
                ${e.companyPhone?`<div style="position:absolute;bottom:10px;font-size:6px;color:#94a3b8;">${s(e.companyPhone)}</div>`:""}
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${r}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${p}`},ge=async e=>{const a=await f(e.memberId,56,{darkColor:"#c9a84cff",lightColor:"#042f2eff"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i="#c9a84c",r="#042f2e",p=`
        <div class="card" style="background:radial-gradient(ellipse at 30% 50%, #065f46 0%, #064e3b 60%, ${r} 100%); color:#fff; font-family:'Playfair Display','Cairo',serif;">
            <!-- Gold double border -->
            <div style="position:absolute;inset:5px;border:1.5px solid rgba(201,168,76,0.45);border-radius:10px;"></div>
            <div style="position:absolute;inset:9px;border:1px solid rgba(201,168,76,0.12);border-radius:8px;"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Vertical text sidebar -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:${i}; font-size:7px; font-weight:700; letter-spacing:4px; font-family:'Inter',sans-serif;">PATRON</div>
                    <div style="color:${i}; font-size:6px;">✦</div>
                </div>

                <!-- Photo Box -->
                <div style="width:72px; height:72px; border:1.5px solid ${i}; border-radius:4px; overflow:hidden; margin-left:8px; margin-top:14px; flex-shrink:0; box-shadow:0 0 14px rgba(201,168,76,0.12);">
                    ${g(e,i,r,i)}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:${i}; font-size:13px; font-weight:700; letter-spacing:2px; text-transform:uppercase; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(201,168,76,0.25);">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(201,168,76,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center; font-size:6px;">✦</div>
                        <div style="font-size:6px; color:#a7c4b5; width:55px; letter-spacing:1px; font-weight:600; font-family:'Inter',sans-serif;">MEMBER ID</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#f0e6d0; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(201,168,76,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center; font-size:6px;">✦</div>
                        <div style="font-size:6px; color:#a7c4b5; width:55px; letter-spacing:1px; font-weight:600; font-family:'Inter',sans-serif;">ACCESS LEVEL</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:${i}; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(201,168,76,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center; font-size:6px;">✦</div>
                        <div style="font-size:6px; color:#a7c4b5; width:55px; letter-spacing:1px; font-weight:600; font-family:'Inter',sans-serif;">VALID UNTIL</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#f0e6d0; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid rgba(201,168,76,0.25); height:14px; margin-top:2px; border-radius:2px;"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;filter:drop-shadow(0 0 2px rgba(201,168,76,0.3));" />`:`<div style="font-size:7px;font-weight:700;color:${i};text-align:center;margin-bottom:12px;">${o}</div>`}
                    <div style="background:rgba(201,168,76,0.08); border:1px solid rgba(201,168,76,0.25); border-radius:3px; padding:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:#6b9e8a; font-size:5px; font-weight:700; letter-spacing:1px; margin-top:4px; font-family:'Inter',sans-serif;">GOLD ACCESS</div>
                </div>
            </div>

            <!-- Bottom footer -->
            <div style="position:absolute;bottom:0;left:0;right:0;height:12px;background:linear-gradient(90deg,#a78734,${i},#a78734);display:flex;align-items:center;justify-content:center;border-radius:0 0 14px 14px;">
                <span style="font-size:5px;font-weight:900;color:${r};letter-spacing:3px;font-family:'Inter',sans-serif;">${o} • ESTEEMED PATRON</span>
            </div>
        </div>
    `,x=`
        <div class="card" style="background:radial-gradient(ellipse at 50% 50%, #065f46 0%, #064e3b 60%, ${r} 100%); color:#fff; font-family:'Playfair Display','Cairo',serif;">
            <div style="position:absolute;inset:5px;border:1.5px solid rgba(201,168,76,0.45);border-radius:10px;"></div>
            <div style="position:absolute;inset:9px;border:1px solid rgba(201,168,76,0.12);border-radius:8px;"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 12px);text-align:center;gap:5px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="3"/></svg>
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:32px;object-fit:contain;" />`:""}
                <div style="font-size:18px;font-weight:700;color:${i};letter-spacing:1px;">${o}</div>
                <div style="font-size:7px;color:#a7c4b5;letter-spacing:5px;font-weight:700;font-family:'Inter',sans-serif;">EMERALD CLUB</div>
                <div style="width:70px;height:1px;background:linear-gradient(90deg,transparent,${i},transparent);margin:3px 0;"></div>
                <div style="font-size:6px;color:#6b9e8a;letter-spacing:2px;font-style:italic;">Privilege. Distinction. Luxury.</div>
                <div style="margin-top:8px;">
                    <div style="font-size:5px;color:${i};font-family:'Cairo',sans-serif;">ختم التميز</div>
                    <div style="width:100px;border-bottom:1px solid rgba(201,168,76,0.25);margin-top:6px;"></div>
                </div>
            </div>

            <div style="position:absolute;bottom:0;left:0;right:0;height:12px;background:linear-gradient(90deg,#a78734,${i},#a78734);display:flex;align-items:center;justify-content:center;border-radius:0 0 14px 14px;">
                <span style="font-size:5px;font-weight:900;color:${r};letter-spacing:3px;font-family:'Inter',sans-serif;">${e.companyPhone?s(e.companyPhone)+" • ":""}${o}</span>
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${p}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${x}`},be=async e=>{const a=await f(e.memberId,56,{darkColor:"#22d3eeff",lightColor:"#0c0424ff"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i="#22d3ee",r="#ec4899",p="#0c0424",x=`
        <div class="card" style="background:${p}; color:#fff; font-family:'Orbitron','Cairo',sans-serif; overflow:hidden;">
            <!-- Grid lines -->
            <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,0,127,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,0,127,0.06) 1px, transparent 1px);background-size:16px 16px;"></div>
            <!-- Neon top border -->
            <div style="position:absolute;top:0;left:0;right:0;height:2px;background:${r};"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Vertical text sidebar -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="2.5"><path d="M4 8l8-4 8 4M4 16l8 4 8-4"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:${i}; font-size:7px; font-weight:800; letter-spacing:4px;">SYNTH</div>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${r}" stroke-width="2.5"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg>
                </div>

                <!-- Photo Box -->
                <div style="width:72px; height:72px; border:2px solid ${i}; border-radius:50% 50% 6px 6px; overflow:hidden; margin-left:8px; margin-top:14px; flex-shrink:0; box-shadow:0 0 10px rgba(34,211,238,0.3);">
                    ${g(e,i,"#1a0a3e",i)}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:${i}; font-size:12px; font-weight:900; letter-spacing:2px; text-transform:uppercase; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(34,211,238,0.3);">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(34,211,238,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="font-size:6px; color:#cbd5e1; width:55px; letter-spacing:1px; font-weight:600; font-family:monospace;">SYS.ID</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:${i}; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(236,72,153,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="font-size:6px; color:#cbd5e1; width:55px; letter-spacing:1px; font-weight:600; font-family:monospace;">PROGRAM</div>
                        <div style="font-size:6px; color:${r}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:${r}; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(34,211,238,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="font-size:6px; color:#cbd5e1; width:55px; letter-spacing:1px; font-weight:600; font-family:monospace;">EXPIRE</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid rgba(34,211,238,0.2); height:14px; margin-top:2px;"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;filter:brightness(1.5) drop-shadow(0 0 2px ${r});" />`:`<div style="font-size:7px;font-weight:900;color:${r};text-align:center;margin-bottom:12px;">${o}</div>`}
                    <div style="border:1px solid ${i}; padding:2px; border-radius:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:${r}; font-size:5px; font-weight:700; letter-spacing:1.5px; margin-top:4px;">SCAN</div>
                </div>
            </div>

            <!-- Neon bottom border -->
            <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:${i};"></div>
            <div style="position:absolute; bottom:5px; left:0; right:0; display:flex; justify-content:center;">
                <span style="font-size:5px; color:#6b7280; font-weight:700; letter-spacing:2px;">${o} • THE FUTURE IS NOW</span>
            </div>
        </div>
    `,c=`
        <div class="card" style="background:${p}; color:#fff; font-family:'Orbitron','Cairo',sans-serif; overflow:hidden;">
            <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,0,127,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,0,127,0.06) 1px, transparent 1px);background-size:16px 16px;"></div>
            <div style="position:absolute;top:0;left:0;right:0;height:2px;background:${r};"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 4px);text-align:center;gap:5px;">
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:30px;object-fit:contain;filter:brightness(1.4);" />`:""}
                <div style="font-size:20px;font-weight:900;color:${i};letter-spacing:1px;">${o}</div>
                <div style="font-size:8px;color:${r};letter-spacing:5px;font-weight:900;">SYNTHWAVE CLUB</div>
                <div style="width:80px;height:1px;background:linear-gradient(90deg,transparent,${i},transparent);margin:4px 0;"></div>
                <div style="font-size:6px;color:#cbd5e1;letter-spacing:2px;">THE FUTURE IS NOW</div>
                <div style="margin-top:10px;">
                    <div style="font-size:5px;color:${r};font-family:'Cairo',sans-serif;">توقيع المشرف</div>
                    <div style="width:100px;border-bottom:1px solid rgba(255,0,127,0.3);margin-top:6px;"></div>
                </div>
            </div>

            <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:${i};"></div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${x}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${c}`},he=async e=>{const a=await f(e.memberId,56,{darkColor:"#ffffffff",lightColor:"#131313ff"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i="#ef4444",r="#131313",p=`
        <div class="card" style="background:${r}; color:#fff; font-family:'Inter','Cairo',sans-serif; overflow:hidden; border:1px solid #2a2a2a;">
            <!-- Carbon diagonal hatching -->
            <div style="position:absolute;inset:0;opacity:0.07;background-image:repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 14px);"></div>
            <!-- Red accent scan line -->
            <div style="position:absolute;top:26px;left:0;right:0;height:1px;background:linear-gradient(90deg, transparent 10%, ${i} 50%, transparent 90%);opacity:0.6;"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Vertical text sidebar -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:${i}; font-size:7px; font-weight:900; letter-spacing:4px; font-family:monospace;">SECURE</div>
                    <div style="width:6px;height:6px;border:1.5px solid ${i};transform:rotate(45deg);"></div>
                </div>

                <!-- Photo Box with crosshair corners -->
                <div style="position:relative; width:72px; height:72px; margin-left:8px; margin-top:14px; flex-shrink:0;">
                    <div style="width:100%;height:100%;border:1px solid #444;overflow:hidden;background:#1a1a1a;">
                        ${g(e,"#444","#1a1a1a",i)}
                    </div>
                    <!-- Crosshair corners -->
                    <div style="position:absolute;top:-2px;left:-2px;width:8px;height:8px;border-top:1.5px solid ${i};border-left:1.5px solid ${i};"></div>
                    <div style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;border-top:1.5px solid ${i};border-right:1.5px solid ${i};"></div>
                    <div style="position:absolute;bottom:-2px;left:-2px;width:8px;height:8px;border-bottom:1.5px solid ${i};border-left:1.5px solid ${i};"></div>
                    <div style="position:absolute;bottom:-2px;right:-2px;width:8px;height:8px;border-bottom:1.5px solid ${i};border-right:1.5px solid ${i};"></div>
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:#f8fafc; font-size:12px; font-weight:900; letter-spacing:1px; text-transform:uppercase; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid #333;">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid #333; padding-bottom:3px; margin-bottom:5px;">
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600; font-family:monospace;">UUID</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#e2e8f0; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid #333; padding-bottom:3px; margin-bottom:5px;">
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600; font-family:monospace;">MEMB.SYS</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:${i}; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid #333; padding-bottom:3px; margin-bottom:5px;">
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600; font-family:monospace;">EXPIRES</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#e2e8f0; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid #333; height:14px; margin-top:2px;"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;filter:grayscale(0.3) brightness(1.1);" />`:`<div style="font-size:7px;font-weight:900;color:#94a3b8;text-align:center;margin-bottom:12px;font-family:monospace;">${o}</div>`}
                    <div style="background:#0a0a0a; border:1px solid #333; border-radius:3px; padding:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:#64748b; font-size:5px; font-weight:700; letter-spacing:1px; margin-top:4px; font-family:monospace;">STEALTH</div>
                </div>
            </div>

            <!-- Bottom bar -->
            <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:${i};"></div>
            <div style="position:absolute; bottom:6px; left:0; right:0; display:flex; justify-content:center;">
                <span style="font-size:5px; color:#64748b; font-weight:700; letter-spacing:2px; font-family:monospace;">${o} • RESTRICTED ACCESS</span>
            </div>
        </div>
    `,x=`
        <div class="card" style="background:${r}; color:#fff; font-family:'Inter','Cairo',sans-serif; overflow:hidden; border:1px solid #2a2a2a;">
            <div style="position:absolute;inset:0;opacity:0.07;background-image:repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 14px);"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 4px);text-align:center;gap:5px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="1.5" style="filter:drop-shadow(0 0 3px rgba(239,68,68,0.3));"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:30px;object-fit:contain;filter:grayscale(0.3) brightness(1.1);" />`:""}
                <div style="font-size:18px;font-weight:900;color:#fff;letter-spacing:1px;">${o}</div>
                <div style="font-size:7px;color:#94a3b8;letter-spacing:5px;font-weight:700;font-family:monospace;">CARBON PATRON</div>
                <div style="width:60px;height:1px;background:#333;margin:3px 0;"></div>
                <div style="font-size:5px;color:#64748b;letter-spacing:2px;font-family:monospace;">RESTRICTED ACCESS ONLY</div>
                <div style="margin-top:8px;">
                    <div style="font-size:5px;color:#e2e8f0;font-family:'Cairo',sans-serif;">إمضاء المدير</div>
                    <div style="width:100px;border-bottom:1px solid #333;margin-top:6px;"></div>
                </div>
            </div>

            <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:${i};"></div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${p}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${x}`},ue=async e=>{const a=await f(e.memberId,56,{darkColor:"#ffffffff",lightColor:"#00000000"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i="#38bdf8",r="#080d18",p=`
        <div class="card" style="background:${r}; color:#fff; font-family:'Inter','Cairo',sans-serif; overflow:hidden;">
            <!-- Aurora light blurs -->
            <div style="position:absolute;top:-30px;left:-20px;width:140px;height:100px;background:radial-gradient(circle, rgba(16,185,129,0.25) 0%, transparent 70%);border-radius:50%;filter:blur(25px);pointer-events:none;"></div>
            <div style="position:absolute;bottom:-30px;right:-15px;width:150px;height:100px;background:radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%);border-radius:50%;filter:blur(25px);pointer-events:none;"></div>
            <!-- Ambient bottom stripe -->
            <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg, #10b981, #3b82f6, #8b5cf6);"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Vertical text sidebar -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:${i}; font-size:7px; font-weight:800; letter-spacing:4px;">AURORA</div>
                    <div style="width:4px;height:4px;border-radius:50%;background:${i};"></div>
                </div>

                <!-- Photo Box -->
                <div style="width:72px; height:72px; border:1.5px solid rgba(255,255,255,0.15); border-radius:10px; overflow:hidden; margin-left:8px; margin-top:14px; flex-shrink:0; background:rgba(255,255,255,0.08); box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                    ${g(e,"rgba(255,255,255,0.15)","rgba(255,255,255,0.04)","rgba(56,189,248,0.6)")}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:#fff; font-size:13px; font-weight:800; letter-spacing:2px; text-transform:uppercase; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.1);">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        </div>
                        <div style="font-size:6px; color:#cbd5e1; width:55px; letter-spacing:1px; font-weight:600;">MEMBER ID</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20h20l-2-8-4 4-4-6-4 6-4-4-2 8z"/></svg>
                        </div>
                        <div style="font-size:6px; color:#cbd5e1; width:55px; letter-spacing:1px; font-weight:600;">ACCESS</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:${i}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <div style="font-size:6px; color:#cbd5e1; width:55px; letter-spacing:1px; font-weight:600;">VALID THRU</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid rgba(255,255,255,0.08); height:14px; margin-top:2px; border-radius:4px; background:rgba(255,255,255,0.03);"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;filter:brightness(1.2);" />`:`<div style="font-size:7px;font-weight:800;color:#fff;text-align:center;margin-bottom:12px;">${o}</div>`}
                    <div style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.1); border-radius:6px; padding:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:rgba(255,255,255,0.3); font-size:5px; font-weight:700; letter-spacing:1px; margin-top:4px;">COSMIC ID</div>
                </div>
            </div>

            <div style="position:absolute; bottom:5px; left:0; right:0; display:flex; justify-content:center;">
                <span style="font-size:5px; color:rgba(255,255,255,0.2); font-weight:700; letter-spacing:2px;">${o} • ONE WITH THE STARS</span>
            </div>
        </div>
    `,x=`
        <div class="card" style="background:${r}; color:#fff; font-family:'Inter','Cairo',sans-serif; overflow:hidden;">
            <div style="position:absolute;top:-30px;right:-20px;width:140px;height:100px;background:radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%);border-radius:50%;filter:blur(25px);pointer-events:none;"></div>
            <div style="position:absolute;bottom:-30px;left:-15px;width:150px;height:100px;background:radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%);border-radius:50%;filter:blur(25px);pointer-events:none;"></div>
            <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:linear-gradient(90deg, #10b981, #3b82f6, #8b5cf6);"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 2px);text-align:center;gap:5px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:30px;object-fit:contain;filter:brightness(1.2);" />`:""}
                <div style="font-size:18px;font-weight:900;color:#fff;letter-spacing:1px;">${o}</div>
                <div style="font-size:7px;color:#cbd5e1;letter-spacing:5px;font-weight:700;">AURORA CLUB</div>
                <div style="width:70px;height:1px;background:rgba(255,255,255,0.08);margin:3px 0;"></div>
                <div style="font-size:5px;color:#cbd5e1;letter-spacing:2px;font-style:italic;">One with the stars.</div>
                <div style="margin-top:8px;">
                    <div style="font-size:5px;color:${i};font-family:'Cairo',sans-serif;">إمضاء الإدارة</div>
                    <div style="width:100px;border-bottom:1px solid rgba(255,255,255,0.08);margin-top:6px;"></div>
                </div>
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${p}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${x}`},ve=async e=>{const a=await f(e.memberId,56,{darkColor:"#ffffffff",lightColor:"#00000000"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i=`
        <div class="card" style="background:linear-gradient(160deg, #7f1d1d 0%, #b91c1c 30%, #ea580c 70%, #f59e0b 100%); color:#fff; font-family:'Inter','Cairo',sans-serif; overflow:hidden;">
            <!-- Diagonal accent stripes -->
            <div style="position:absolute;top:0;right:40px;width:30px;height:200%;background:rgba(255,255,255,0.04);transform:rotate(25deg);transform-origin:top;"></div>
            <div style="position:absolute;top:0;right:70px;width:10px;height:200%;background:rgba(255,255,255,0.02);transform:rotate(25deg);transform-origin:top;"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Vertical text sidebar -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:rgba(255,255,255,0.9); font-size:7px; font-weight:800; letter-spacing:4px;">BLAZING</div>
                    <div style="color:rgba(255,255,255,0.6); font-size:8px;">▸</div>
                </div>

                <!-- Photo Box -->
                <div style="width:72px; height:72px; border:2px solid rgba(255,255,255,0.45); border-radius:8px; overflow:hidden; margin-left:8px; margin-top:14px; flex-shrink:0; box-shadow:0 4px 16px rgba(0,0,0,0.25);">
                    ${g(e,"#fff","rgba(127,29,29,0.6)","rgba(255,255,255,0.7)")}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:#fff; font-size:13px; font-weight:900; letter-spacing:2px; text-transform:uppercase; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.3); text-shadow:0 1px 4px rgba(0,0,0,0.3);">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:rgba(255,255,255,0.7); display:flex; justify-content:center; font-size:7px;">▸</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.6); width:55px; letter-spacing:1px; font-weight:600;">MEMBER ID</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.4); width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:rgba(255,255,255,0.7); display:flex; justify-content:center; font-size:7px;">▸</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.6); width:55px; letter-spacing:1px; font-weight:600;">PACKAGE</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.4); width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:rgba(255,255,255,0.7); display:flex; justify-content:center; font-size:7px;">▸</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.6); width:55px; letter-spacing:1px; font-weight:600;">EXPIRES</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.4); width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid rgba(255,255,255,0.2); height:14px; margin-top:2px; border-radius:4px; background:rgba(255,255,255,0.05);"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;filter:brightness(1.3) drop-shadow(0 0 3px rgba(0,0,0,0.2));" />`:`<div style="font-size:7px;font-weight:800;color:#fff;text-align:center;margin-bottom:12px;text-shadow:0 1px 3px rgba(0,0,0,0.2);">${o}</div>`}
                    <div style="background:rgba(255,255,255,0.15); border-radius:6px; padding:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:rgba(255,255,255,0.5); font-size:5px; font-weight:700; letter-spacing:1px; margin-top:4px;">SCAN</div>
                </div>
            </div>

            <div style="position:absolute; bottom:10px; left:0; right:0; display:flex; justify-content:center;">
                <span style="font-size:5px; color:rgba(255,255,255,0.35); font-weight:700; letter-spacing:2px;">${o} • PASSION THAT NEVER FADES</span>
            </div>
        </div>
    `,r=`
        <div class="card" style="background:linear-gradient(160deg, #7f1d1d 0%, #b91c1c 30%, #ea580c 70%, #f59e0b 100%); color:#fff; font-family:'Inter','Cairo',sans-serif; overflow:hidden;">
            <div style="position:absolute;top:0;left:40px;width:30px;height:200%;background:rgba(255,255,255,0.06);transform:rotate(-25deg);transform-origin:top;"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:5px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:32px;object-fit:contain;filter:brightness(1.3);" />`:""}
                <div style="font-size:20px;font-weight:900;color:#fff;letter-spacing:1px;text-shadow:0 2px 6px rgba(0,0,0,0.3);">${o}</div>
                <div style="font-size:7px;color:rgba(255,255,255,0.7);letter-spacing:5px;font-weight:700;">SUNSET CLUB</div>
                <div style="width:50px;height:2px;background:rgba(255,255,255,0.4);border-radius:1px;margin:2px 0;"></div>
                <div style="font-size:5px;color:rgba(255,255,255,0.5);letter-spacing:2px;">PASSION THAT NEVER FADES</div>
                <div style="margin-top:8px;">
                    <div style="font-size:5px;color:rgba(255,255,255,0.5);font-family:'Cairo',sans-serif;">التوقيع والختم</div>
                    <div style="width:100px;border-bottom:1px solid rgba(255,255,255,0.2);margin-top:6px;"></div>
                </div>
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${i}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${r}`},ye=async e=>{const a=await f(e.memberId,56,{darkColor:"#b76e79ff",lightColor:"#fdf2f4ff"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i="#b76e79",r="#3b1f2b",p=`
        <div class="card" style="background:linear-gradient(135deg, #fdf2f4 0%, #f7d6db 50%, #f0b8c4 100%); color:${r}; font-family:'Playfair Display','Cairo',serif; overflow:hidden;">
            <!-- Delicate diagonal line pattern -->
            <div style="position:absolute;inset:0;opacity:0.04;background-image:repeating-linear-gradient(135deg, ${i} 0px, ${i} 1px, transparent 1px, transparent 20px);"></div>
            <!-- Inner rose-gold frame -->
            <div style="position:absolute;inset:6px;border:1px solid rgba(183,110,121,0.3);border-radius:10px;"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Vertical text sidebar -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:${i}; font-size:7px; font-weight:700; letter-spacing:4px; font-family:'Inter',sans-serif;">BLOSSOM</div>
                    <div style="color:${i}; font-size:6px;">❀</div>
                </div>

                <!-- Photo Box -->
                <div style="width:72px; height:72px; border:1.5px solid ${i}; border-radius:8px; overflow:hidden; margin-left:8px; margin-top:14px; flex-shrink:0; box-shadow:0 3px 12px rgba(183,110,121,0.15);">
                    ${g(e,i,"#fdf2f4",i)}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:${r}; font-size:13px; font-weight:700; letter-spacing:1px; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(183,110,121,0.25);">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(183,110,121,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center; font-size:6px;">❀</div>
                        <div style="font-size:6px; color:#8b6575; width:55px; letter-spacing:1px; font-weight:600; font-family:'Inter',sans-serif;">MEMBER ID</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:600; color:${r}; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(183,110,121,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center; font-size:6px;">❀</div>
                        <div style="font-size:6px; color:#8b6575; width:55px; letter-spacing:1px; font-weight:600; font-family:'Inter',sans-serif;">PACKAGE</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:600; color:${i}; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(183,110,121,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:${i}; display:flex; justify-content:center; font-size:6px;">❀</div>
                        <div style="font-size:6px; color:#8b6575; width:55px; letter-spacing:1px; font-weight:600; font-family:'Inter',sans-serif;">VALID UNTIL</div>
                        <div style="font-size:6px; color:${i}; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:600; color:${r}; font-family:'Inter',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid rgba(183,110,121,0.2); height:14px; margin-top:2px; border-radius:3px;"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;" />`:`<div style="font-size:7px;font-weight:700;color:${i};text-align:center;margin-bottom:12px;">${o}</div>`}
                    <div style="background:rgba(183,110,121,0.06); border:1px solid rgba(183,110,121,0.2); border-radius:6px; padding:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:#8b6575; font-size:5px; font-weight:700; letter-spacing:1px; margin-top:4px; font-family:'Inter',sans-serif;">VERIFY</div>
                </div>
            </div>

            <!-- Bottom footer bar -->
            <div style="position:absolute;bottom:0;left:0;right:0;height:14px;background:linear-gradient(90deg,${i},#d4929e);display:flex;align-items:center;justify-content:center;border-radius:0 0 14px 14px;">
                <span style="font-size:5px;font-weight:700;color:#fff;letter-spacing:3px;font-family:'Inter',sans-serif;">${o} • SAKURA COLLECTION</span>
            </div>
        </div>
    `,x=`
        <div class="card" style="background:linear-gradient(135deg, #fdf2f4 0%, #f7d6db 50%, #f0b8c4 100%); color:${r}; font-family:'Playfair Display','Cairo',serif; overflow:hidden;">
            <div style="position:absolute;inset:0;opacity:0.04;background-image:repeating-linear-gradient(135deg, ${i} 0px, ${i} 1px, transparent 1px, transparent 20px);"></div>
            <div style="position:absolute;inset:6px;border:1px solid rgba(183,110,121,0.3);border-radius:10px;"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 14px);text-align:center;gap:5px;">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${i}" stroke-width="1.5" style="opacity:0.8;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:32px;object-fit:contain;" />`:""}
                <div style="font-size:18px;font-weight:700;color:${i};">${o}</div>
                <div style="font-size:7px;color:#8b6575;letter-spacing:5px;font-weight:600;font-family:'Inter',sans-serif;">BLOSSOM CLUB</div>
                <div style="width:50px;height:1px;background:linear-gradient(90deg,transparent,${i},transparent);margin:3px 0;"></div>
                <div style="font-size:6px;color:#8b6575;letter-spacing:2px;font-style:italic;">Grace in every detail.</div>
                <div style="margin-top:8px;">
                    <div style="font-size:5px;color:${i};font-family:'Cairo',sans-serif;">ختم الأناقة</div>
                    <div style="width:100px;border-bottom:1px solid rgba(183,110,121,0.25);margin-top:6px;"></div>
                </div>
            </div>

            <div style="position:absolute;bottom:0;left:0;right:0;height:14px;background:linear-gradient(90deg,${i},#d4929e);display:flex;align-items:center;justify-content:center;border-radius:0 0 14px 14px;">
                <span style="font-size:5px;font-weight:700;color:#fff;letter-spacing:3px;font-family:'Inter',sans-serif;">${e.companyPhone?s(e.companyPhone)+" • ":""}${o}</span>
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${p}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${x}`},we=async e=>{const a=await f(e.memberId,56,{darkColor:"#334155ff",lightColor:"#f8fafcff"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),i=`
        <div class="card" style="background:linear-gradient(180deg, #1e293b 0%, #334155 50%, #f8fafc 50%, #f8fafc 100%); color:#fff; font-family:'Inter','Cairo',sans-serif; overflow:hidden;">
            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Vertical text sidebar -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:#94a3b8; font-size:7px; font-weight:800; letter-spacing:4px;">ACCESS</div>
                    <div style="width:1px;height:12px;background:#94a3b8;opacity:0.3;"></div>
                </div>

                <!-- Photo Box (crosses the dark/light boundary) -->
                <div style="width:72px; height:72px; border-radius:50%; border:3px solid #fff; overflow:hidden; margin-left:8px; margin-top:14px; flex-shrink:0; box-shadow:0 4px 16px rgba(0,0,0,0.2);">
                    ${g(e,"#fff","#334155","#94a3b8")}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:#fff; font-size:13px; font-weight:900; letter-spacing:1px; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.15);">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(148,163,184,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:#94a3b8; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        </div>
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600;">MEMBER ID</div>
                        <div style="font-size:6px; color:#64748b; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(148,163,184,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:#94a3b8; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20h20l-2-8-4 4-4-6-4 6-4-4-2 8z"/></svg>
                        </div>
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600;">PACKAGE</div>
                        <div style="font-size:6px; color:#64748b; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(148,163,184,0.2); padding-bottom:3px; margin-bottom:5px;">
                        <div style="width:16px; color:#94a3b8; display:flex; justify-content:center;">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        </div>
                        <div style="font-size:6px; color:#94a3b8; width:55px; letter-spacing:1px; font-weight:600;">VALID UNTIL</div>
                        <div style="font-size:6px; color:#64748b; width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid #e2e8f0; height:14px; margin-top:2px; border-radius:2px;"></div>
                </div>

                <!-- RIGHT: Logo + QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; padding-top:4px;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:48px;max-height:36px;object-fit:contain;margin-bottom:12px;" />`:`<div style="font-size:7px;font-weight:700;color:#94a3b8;text-align:center;letter-spacing:2px;margin-bottom:12px;">${o}</div>`}
                    <div style="border:1px solid #e2e8f0; border-radius:4px; padding:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                </div>
            </div>

            <div style="position:absolute; bottom:10px; left:0; right:0; display:flex; justify-content:center;">
                <span style="font-size:5px; color:#94a3b8; font-weight:700; letter-spacing:2px;">${o} • ACCESS CARD</span>
            </div>
        </div>
    `,r=`
        <div class="card" style="background:#f8fafc; color:#1e293b; font-family:'Inter','Cairo',sans-serif; overflow:hidden; border:1px solid #e2e8f0;">
            <div style="position:absolute;top:0;left:0;right:0;height:40%;background:linear-gradient(180deg, #1e293b, #334155);"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:5px;">
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:32px;object-fit:contain;" />`:""}
                <div style="font-size:20px;font-weight:900;color:#fff;letter-spacing:1px;">${o}</div>
                <div style="font-size:7px;color:#94a3b8;letter-spacing:4px;font-weight:700;">ACCESS CARD</div>

                <div style="margin-top:20px;text-align:center;">
                    <div style="font-size:5px;color:#94a3b8;font-family:'Cairo',sans-serif;">التوقيع والختم</div>
                    <div style="width:100px;border-bottom:1px solid #e2e8f0;margin-top:6px;"></div>
                </div>
                ${e.companyPhone?`<div style="position:absolute;bottom:10px;font-size:6px;color:#94a3b8;">${s(e.companyPhone)}</div>`:""}
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${i}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${r}`},Ee=async e=>{const a=await f(e.memberId,56,{darkColor:"#ffffffff",lightColor:"#00000000"}),l=s(e.memberName),o=s(e.companyName),n=s(e.packageName),r=`
        <div class="card" style="background:#0f172a; color:#fff; font-family:'Inter','Cairo',sans-serif; overflow:hidden;">
            ${e.customerPhoto?`<img src="${e.customerPhoto}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(0.4) saturate(0.6);" />`:'<div style="position:absolute;inset:0;background:linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0ea5e9 100%);"></div>'}
            <!-- Dark gradient scrim for text readability -->
            <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.7) 100%);"></div>

            <div style="position:relative;z-index:1;display:flex;height:100%;padding:20px 18px 28px 16px;">
                <!-- LEFT: Company branding vertical -->
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; width:16px; gap:8px;">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(255,255,255,0.8)" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                    <div style="writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg); color:rgba(255,255,255,0.7); font-size:7px; font-weight:800; letter-spacing:4px;">PHOTO ID</div>
                    <div style="width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.4);"></div>
                </div>

                <!-- No photo box — the whole card IS the photo -->
                <!-- We still need the structure, so use company logo space -->
                <div style="width:72px; display:flex; flex-direction:column; align-items:center; justify-content:center; margin-left:8px; flex-shrink:0;">
                    ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:60px;max-height:50px;object-fit:contain;filter:brightness(1.3) drop-shadow(0 1px 4px rgba(0,0,0,0.5));" />`:`<div style="font-size:10px;font-weight:900;color:#fff;text-align:center;text-shadow:0 2px 6px rgba(0,0,0,0.5);">${o}</div>`}
                </div>

                <!-- Data Rows -->
                <div style="flex:1; margin-left:14px; display:flex; flex-direction:column; justify-content:center; margin-top:5px;">
                    <div style="color:#fff; font-size:14px; font-weight:900; letter-spacing:2px; text-transform:uppercase; text-align:center; margin-bottom:6px; padding-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.2); text-shadow:0 2px 8px rgba(0,0,0,0.5);">${l}</div>

                    <!-- Row 1: ID -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="font-size:6px; color:rgba(255,255,255,0.5); width:55px; letter-spacing:1px; font-weight:600;">MEMBER ID</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.3); width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s(e.memberId)}</div>
                    </div>

                    <!-- Row 2: Package -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="font-size:6px; color:rgba(255,255,255,0.5); width:55px; letter-spacing:1px; font-weight:600;">ACCESS</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.3); width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n}</div>
                    </div>

                    <!-- Row 3: Valid Until -->
                    <div style="display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:3px; margin-bottom:5px;">
                        <div style="font-size:6px; color:rgba(255,255,255,0.5); width:55px; letter-spacing:1px; font-weight:600;">EXPIRES</div>
                        <div style="font-size:6px; color:rgba(255,255,255,0.3); width:8px; text-align:center;">:</div>
                        <div style="flex:1; min-width:0; font-size:7px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m(e.endDate)}</div>
                    </div>

                    <!-- Signature Box -->
                    <div style="border:1px solid rgba(255,255,255,0.15); height:14px; margin-top:2px; border-radius:3px; background:rgba(255,255,255,0.03);"></div>
                </div>

                <!-- RIGHT: QR -->
                <div style="width:55px; margin-left:14px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                    <div style="background:rgba(255,255,255,0.1); border-radius:6px; padding:2px;">
                        <img src="${a}" width="56" height="56" style="display:block;" alt="QR Code"/>
                    </div>
                    <div style="color:rgba(255,255,255,0.4); font-size:5px; font-weight:700; letter-spacing:1px; margin-top:4px;">SCAN</div>
                </div>
            </div>

            <div style="position:absolute; bottom:10px; left:0; right:0; display:flex; justify-content:center;">
                <span style="font-size:5px; color:rgba(255,255,255,0.3); font-weight:700; letter-spacing:2px;">${o} • YOUR IDENTITY. YOUR ACCESS.</span>
            </div>
        </div>
    `,p=`
        <div class="card" style="background:linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0ea5e9 100%); color:#fff; font-family:'Inter','Cairo',sans-serif; overflow:hidden;">
            <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 50%);"></div>

            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;gap:5px;">
                ${e.companyLogo?`<img src="${e.companyLogo}" style="max-width:55px;max-height:34px;object-fit:contain;filter:brightness(1.3);" />`:""}
                <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:1px;text-shadow:0 2px 6px rgba(0,0,0,0.3);">${o}</div>
                <div style="font-size:7px;color:rgba(255,255,255,0.6);letter-spacing:5px;font-weight:600;">PHOTO ID</div>
                <div style="width:50px;height:2px;background:rgba(255,255,255,0.3);border-radius:1px;margin:2px 0;"></div>
                <div style="font-size:5px;color:rgba(255,255,255,0.4);letter-spacing:2px;">YOUR IDENTITY. YOUR ACCESS.</div>
                <div style="margin-top:10px;">
                    <div style="font-size:5px;color:rgba(255,255,255,0.4);font-family:'Cairo',sans-serif;">التوقيع والختم</div>
                    <div style="width:100px;border-bottom:1px solid rgba(255,255,255,0.15);margin-top:6px;"></div>
                </div>
            </div>
        </div>
    `;return`<div class="card-label">FRONT — الوجه الأمامي</div>${r}<div class="card-label" style="margin-top:16px;">BACK — الوجه الخلفي</div>${p}`},Ce=[{id:"cyberpunk",name:"Cyberpunk Dark",nameAr:"تقني داكن",preview:"linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 50%, #E87A1E 100%)"},{id:"royal",name:"Royal Gold",nameAr:"ذهبي ملكي",preview:"linear-gradient(135deg, #0a1628 0%, #1a2744 50%, #c8973a 100%)"},{id:"gradient",name:"Modern Gradient",nameAr:"تدرج عصري",preview:"linear-gradient(135deg, #7c3aed 0%, #3b82f6 50%, #06b6d4 100%)"},{id:"minimal",name:"Minimal Clean",nameAr:"بسيط أنيق",preview:"linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #64748b 100%)"},{id:"emerald",name:"Emerald Forest",nameAr:"غابة الزمرد",preview:"linear-gradient(135deg, #064e3b 0%, #065f46 50%, #c8973a 100%)"},{id:"retro",name:"Retro Synthwave",nameAr:"ريترو سينث",preview:"linear-gradient(135deg, #12072b 0%, #ff007f 60%, #00ffff 100%)"},{id:"carbon",name:"Carbon Fiber",nameAr:"ألياف الكربون",preview:"linear-gradient(135deg, #151515 0%, #333333 60%, #ef4444 100%)"},{id:"aurora",name:"Aurora Boreal",nameAr:"أضواء الشفق",preview:"linear-gradient(135deg, #090d16 0%, #10b981 40%, #3b82f6 70%, #8b5cf6 100%)"},{id:"sunset",name:"Sunset Blaze",nameAr:"لهيب الغروب",preview:"linear-gradient(135deg, #dc2626 0%, #f97316 60%, #fbbf24 100%)"},{id:"sakura",name:"Sakura Blossom",nameAr:"زهور الساكورا",preview:"linear-gradient(135deg, #fff1f2 0%, #fbcfe8 50%, #f472b6 100%)"},{id:"keycard",name:"Hotel Keycard",nameAr:"بطاقة فندقية",preview:"linear-gradient(180deg, #1e293b 0%, #334155 40%, #f8fafc 100%)"},{id:"overlay",name:"Photo Overlay",nameAr:"غلاف صورة",preview:"linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #38bdf8 100%)"}],Ne=`
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700;800;900&family=Cairo:wght@400;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1e293b; font-family: 'Cairo', sans-serif; }
    .cards-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        padding: 40px 20px;
    }
    .card-label {
        color: #94a3b8;
        font-size: 13px;
        font-weight: 700;
        text-align: center;
        margin-bottom: 8px;
        letter-spacing: 1px;
        text-transform: uppercase;
        font-family: 'Inter', 'Cairo', sans-serif;
    }
    .card {
        width: 340px;
        height: 214px;
        border-radius: 14px;
        overflow: hidden;
        position: relative;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        direction: ltr; /* Force LTR layout for cards regardless of app direction */
    }
    /* Print-specific: strip animations, fix glassmorphism, normalize colors */
    @media print {
        @page { size: A4; margin: 15mm; }
        body { background: white !important; }
        .no-print { display: none !important; }
        .card { box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important; }
        .card-label { color: #475569 !important; }
        /* Glassmorphism fallback: backdrop-filter doesn't work in print */
        [style*="backdrop-filter"] { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
        /* Suppress CSS animations in print */
        * { animation: none !important; transition: none !important; }
    }
`,Q={cyberpunk:xe,royal:me,gradient:fe,minimal:ce,emerald:ge,retro:be,carbon:he,aurora:ue,sunset:ve,sakura:ye,keycard:we,overlay:Ee},Re={teal:"#0f766e",blue:"#1d4ed8",indigo:"#4338ca",purple:"#7e22ce",rose:"#be123c",emerald:"#047857",amber:"#b45309",slate:"#334155"},Pe=async(e,a,l="cyberpunk")=>{const o=a||{companyName:"Company",companyPhone:""},n={memberName:e.customerName||"عضو",memberId:e.membershipNumber||e.id?.substring(0,8)||"---",packageName:e.packageName||"عضوية",joinDate:e.joinDate||"",endDate:e.endDate||"",status:e.status||"ACTIVE",companyName:o.companyName||"Company",companyLogo:o.logo||void 0,companyPhone:o.companyPhone||void 0,themeColor:Re[o.themeColor||"teal"]||o.themeColor||"#0f766e",customerPhoto:e.customerPhoto||void 0},r=await(Q[l]||Q.cyberpunk)(n),p=`
        <style>${Ne}</style>
        <div class="cards-container">
            ${r}
        </div>
    `;J("membership-card",`بطاقة العضوية — ${n.memberName}`,p)},Le=({viewType:e,onNavigate:a})=>{const l=e.replace("membership-detail-",""),{data:o,isLoading:n,isError:i}=ee(l),{data:r}=ie(),p=te(),{showConfirm:x,alert:c,AlertDialogs:K}=oe(),[h,u]=b.useState(!1),[M,F]=b.useState(""),[H,I]=b.useState(""),[v,y]=b.useState(!1),[L,S]=b.useState(""),[E,$]=b.useState(!1),k=b.useRef(null);if(b.useEffect(()=>{const d=C=>{k.current&&!k.current.contains(C.target)&&$(!1)};return E&&document.addEventListener("mousedown",d),()=>document.removeEventListener("mousedown",d)},[E]),b.useEffect(()=>{const d=C=>{C.key==="Escape"&&(h&&u(!1),v&&y(!1))};return(h||v)&&document.addEventListener("keydown",d),()=>document.removeEventListener("keydown",d)},[h,v]),n)return t.jsxDEV("div",{className:"p-8 text-center text-slate-500",children:"جاري التحميل..."},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:55,columnNumber:27},void 0);if(i||!o)return t.jsxDEV("div",{className:"p-8 text-center text-rose-500",children:"خطأ في تحميل بيانات الاشتراك"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:56,columnNumber:40},void 0);const Y=d=>{$(!1),Pe(o,r,d)},q=async()=>{if(!M)return c.warning("الرجاء كتابة سبب التجميد");try{await P.freezeMembership(l,{reason:M,endDate:H||void 0}),p.invalidateQueries({queryKey:["membership",l]}),p.invalidateQueries({queryKey:["memberships"]}),u(!1),F(""),I(""),c.success("تم تجميد الاشتراك بنجاح")}catch(d){c.error(`فشل تجميد الاشتراك: ${d.message}`)}},_=()=>{x({title:"تأكيد التفعيل",message:"هل أنت متأكد من تفعيل الاشتراك مجدداً؟",confirmText:"نعم، تفعيل",cancelText:"تراجع",type:"info",onConfirm:async()=>{try{await P.unfreezeMembership(l),p.invalidateQueries({queryKey:["membership",l]}),p.invalidateQueries({queryKey:["memberships"]}),c.success("تم تفعيل الاشتراك بنجاح")}catch(d){c.error(`فشل تفعيل الاشتراك: ${d.message}`)}}})},X=async()=>{try{const d=await P.renewMembership(l,{notes:L});p.invalidateQueries({queryKey:["membership",l]}),p.invalidateQueries({queryKey:["memberships"]}),y(!1),S(""),c.success(`تم تجديد الاشتراك بنجاح وإنشاء فاتورة رقم: ${d.invoiceNumber}`)}catch(d){c.error(`فشل تجديد الاشتراك: ${d.message}`)}},W=()=>{x({title:"تأكيد السداد",message:"هل أنت متأكد من سداد قيمة الاشتراك وتفعيله؟",confirmText:"نعم، تم السداد",cancelText:"تراجع",type:"info",onConfirm:async()=>{try{await P.markMembershipPaid(l),p.invalidateQueries({queryKey:["membership",l]}),p.invalidateQueries({queryKey:["memberships"]}),c.success("تم سداد الاشتراك وتفعيله بنجاح")}catch(d){c.error(`فشل سداد الاشتراك: ${d.message}`)}}})},Z=d=>{switch(d){case w.ACTIVE:return t.jsxDEV("span",{className:"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-emerald-700 bg-emerald-100 border border-emerald-200",children:[t.jsxDEV(z,{size:16},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:135,columnNumber:204},void 0)," نشط"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:135,columnNumber:50},void 0);case w.PENDING_PAYMENT:return t.jsxDEV("span",{className:"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-amber-700 bg-amber-100 border border-amber-200",children:[t.jsxDEV(D,{size:16},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:136,columnNumber:207},void 0)," معلق الدفع"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:136,columnNumber:59},void 0);case w.FROZEN:return t.jsxDEV("span",{className:"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-indigo-700 bg-indigo-100 border border-indigo-200",children:[t.jsxDEV(D,{size:16},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:137,columnNumber:201},void 0)," مجمد"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:137,columnNumber:50},void 0);case w.EXPIRED:return t.jsxDEV("span",{className:"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-slate-700 bg-slate-200 border border-slate-300",children:[t.jsxDEV(D,{size:16},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:138,columnNumber:199},void 0)," منتهي"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:138,columnNumber:51},void 0);case w.CANCELLED:return t.jsxDEV("span",{className:"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-rose-700 bg-rose-100 border border-rose-200",children:[t.jsxDEV(de,{size:16},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:139,columnNumber:198},void 0)," ملغى"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:139,columnNumber:53},void 0);default:return t.jsxDEV("span",{children:d},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:140,columnNumber:29},void 0)}};return t.jsxDEV("div",{className:"flex flex-col h-full bg-slate-50 relative",children:[t.jsxDEV("div",{className:"bg-white px-6 py-5 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm z-10 relative",children:[t.jsxDEV("div",{className:"flex items-center gap-4",children:[t.jsxDEV("button",{onClick:()=>a("memberships"),className:"p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 bg-slate-50 border border-slate-200 shadow-sm",children:t.jsxDEV(re,{size:20},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:153,columnNumber:25},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:149,columnNumber:21},void 0),t.jsxDEV("div",{children:[t.jsxDEV("div",{className:"flex items-center gap-3",children:[t.jsxDEV("h1",{className:"text-2xl font-black text-slate-800 tracking-tight",children:["اشتراك #",o.membershipNumber]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:157,columnNumber:29},void 0),Z(o.status)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:156,columnNumber:25},void 0),t.jsxDEV("p",{className:"text-slate-500 text-sm mt-1 font-medium",children:o.customerName},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:160,columnNumber:25},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:155,columnNumber:21},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:148,columnNumber:17},void 0),t.jsxDEV("div",{className:"flex gap-3",children:[t.jsxDEV("div",{className:"relative",ref:k,children:[t.jsxDEV("button",{onClick:()=>$(!E),className:"px-4 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition-all font-semibold flex items-center gap-2 shadow-sm",children:[t.jsxDEV(A,{size:18},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:170,columnNumber:29},void 0),"طباعة بطاقة"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:166,columnNumber:25},void 0),E&&t.jsxDEV("div",{className:"absolute left-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-slate-200 p-3 z-50 w-64 animate-in fade-in zoom-in-95 duration-150",children:[t.jsxDEV("div",{className:"text-xs font-bold text-slate-500 mb-2 px-1",children:"اختر تصميم البطاقة"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:175,columnNumber:33},void 0),t.jsxDEV("div",{className:"space-y-1.5",children:Ce.map(d=>t.jsxDEV("button",{onClick:()=>Y(d.id),className:"w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-right group",children:[t.jsxDEV("div",{className:"w-10 h-7 rounded-md shadow-inner border border-slate-200 shrink-0 group-hover:scale-110 transition-transform",style:{background:d.preview}},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:183,columnNumber:45},void 0),t.jsxDEV("div",{className:"flex-1",children:[t.jsxDEV("div",{className:"text-sm font-bold text-slate-800",children:d.nameAr},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:188,columnNumber:49},void 0),t.jsxDEV("div",{className:"text-[10px] text-slate-400 font-medium",children:d.name},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:189,columnNumber:49},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:187,columnNumber:45},void 0),t.jsxDEV(A,{size:14,className:"text-slate-300 group-hover:text-slate-500 transition-colors"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:191,columnNumber:45},void 0)]},d.id,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:178,columnNumber:41},void 0))},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:176,columnNumber:33},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:174,columnNumber:29},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:165,columnNumber:21},void 0),o.status==="PENDING_PAYMENT"&&t.jsxDEV("button",{onClick:W,className:"px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all font-semibold border border-emerald-200 flex items-center gap-2 shadow-sm",children:[t.jsxDEV(z,{size:18},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:204,columnNumber:29},void 0),"تأكيد الدفع والتفعيل"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:200,columnNumber:25},void 0),o.status==="ACTIVE"&&t.jsxDEV("button",{onClick:()=>u(!0),className:"px-4 py-2 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition-all font-semibold border border-purple-200 flex items-center gap-2 shadow-sm",children:[t.jsxDEV(j,{size:18},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:213,columnNumber:29},void 0),"تجميد"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:209,columnNumber:25},void 0),o.status==="FROZEN"&&t.jsxDEV("button",{onClick:_,className:"px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all font-semibold border border-emerald-200 flex items-center gap-2 shadow-sm",children:[t.jsxDEV(T,{size:18},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:222,columnNumber:29},void 0),"إلغاء التجميد"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:218,columnNumber:25},void 0),(o.status==="ACTIVE"||o.status==="EXPIRED")&&t.jsxDEV("button",{onClick:()=>y(!0),className:"px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl hover:from-indigo-700 hover:to-indigo-600 transition-all font-bold shadow-md shadow-indigo-500/20 flex items-center gap-2",children:[t.jsxDEV(U,{size:18},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:231,columnNumber:29},void 0),"تجديد الاشتراك"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:227,columnNumber:25},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:163,columnNumber:17},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:147,columnNumber:13},void 0),t.jsxDEV("div",{className:"p-6 flex-1 overflow-auto",children:t.jsxDEV("div",{className:"max-w-4xl mx-auto space-y-6",children:[(h||v)&&t.jsxDEV("div",{className:"fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200",children:[h&&t.jsxDEV("div",{className:"bg-white rounded-2xl shadow-xl border border-purple-100 p-0 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200",children:[t.jsxDEV("div",{className:"bg-purple-50 p-5 border-b border-purple-100 flex justify-between items-center",children:[t.jsxDEV("h3",{className:"font-black text-purple-900 flex items-center gap-2 text-lg",children:[t.jsxDEV("div",{className:"w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-purple-700",children:t.jsxDEV(j,{size:18},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:250,columnNumber:138},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:250,columnNumber:37},void 0),"تجميد الاشتراك"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:249,columnNumber:33},void 0),t.jsxDEV("button",{onClick:()=>u(!1),className:"text-purple-400 hover:text-purple-700 transition-colors p-1",children:t.jsxDEV(O,{size:20},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:253,columnNumber:150},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:253,columnNumber:33},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:248,columnNumber:29},void 0),t.jsxDEV("div",{className:"p-6 space-y-5",children:[t.jsxDEV("div",{className:"space-y-1.5",children:[t.jsxDEV("label",{className:"block text-sm font-bold text-slate-700",children:"سبب التجميد (إجباري)"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:257,columnNumber:37},void 0),t.jsxDEV("input",{type:"text",className:"w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 bg-slate-50 hover:bg-white transition-colors",value:M,onChange:d=>F(d.target.value),placeholder:"مثال: سفر للخارج"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:258,columnNumber:37},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:256,columnNumber:33},void 0),t.jsxDEV("div",{className:"space-y-1.5",children:[t.jsxDEV("label",{className:"block text-sm font-bold text-slate-700",children:"تاريخ انتهاء التجميد (اختياري)"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:267,columnNumber:37},void 0),t.jsxDEV("input",{type:"date",className:"w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 bg-slate-50 hover:bg-white transition-colors",value:H,onChange:d=>I(d.target.value)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:268,columnNumber:37},void 0),t.jsxDEV("p",{className:"text-xs text-slate-500",children:"إذا لم تحدد تاريخاً، سيبقى مجمداً حتى تقوم بتفعيله يدوياً."},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:274,columnNumber:37},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:266,columnNumber:33},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:255,columnNumber:29},void 0),t.jsxDEV("div",{className:"p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3",children:[t.jsxDEV("button",{onClick:()=>u(!1),className:"px-5 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-bold transition-colors",children:"إلغاء"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:278,columnNumber:33},void 0),t.jsxDEV("button",{onClick:q,className:"px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold shadow-md shadow-purple-500/20 hover:bg-purple-700 transition-all",children:"تأكيد التجميد"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:279,columnNumber:33},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:277,columnNumber:29},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:247,columnNumber:25},void 0),v&&t.jsxDEV("div",{className:"bg-white rounded-2xl shadow-xl border border-indigo-100 p-0 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200",children:[t.jsxDEV("div",{className:"bg-indigo-50 p-5 border-b border-indigo-100 flex justify-between items-center",children:[t.jsxDEV("h3",{className:"font-black text-indigo-900 flex items-center gap-2 text-lg",children:[t.jsxDEV("div",{className:"w-8 h-8 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700",children:t.jsxDEV(U,{size:18},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:289,columnNumber:138},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:289,columnNumber:37},void 0),"تجديد الاشتراك"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:288,columnNumber:33},void 0),t.jsxDEV("button",{onClick:()=>y(!1),className:"text-indigo-400 hover:text-indigo-700 transition-colors p-1",children:t.jsxDEV(O,{size:20},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:292,columnNumber:150},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:292,columnNumber:33},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:287,columnNumber:29},void 0),t.jsxDEV("div",{className:"p-6 space-y-5",children:[t.jsxDEV("div",{className:"p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 text-sm text-indigo-900 leading-relaxed",children:["سيتم تجديد اشتراك العميل ",t.jsxDEV("strong",{children:o.customerName},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:296,columnNumber:62},void 0)," على باقة ",t.jsxDEV("strong",{children:o.packageName},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:296,columnNumber:114},void 0)," وإصدار فاتورة جديدة بقيمة ",t.jsxDEV("strong",{className:"text-indigo-700 text-base",children:[o.packagePrice," ج.م"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:296,columnNumber:182},void 0),"."]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:295,columnNumber:33},void 0),t.jsxDEV("div",{className:"space-y-1.5",children:[t.jsxDEV("label",{className:"block text-sm font-bold text-slate-700",children:"ملاحظات (اختياري)"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:299,columnNumber:37},void 0),t.jsxDEV("input",{type:"text",className:"w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-slate-50 hover:bg-white transition-colors",value:L,onChange:d=>S(d.target.value),placeholder:"أي ملاحظات إضافية"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:300,columnNumber:37},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:298,columnNumber:33},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:294,columnNumber:29},void 0),t.jsxDEV("div",{className:"p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3",children:[t.jsxDEV("button",{onClick:()=>y(!1),className:"px-5 py-2.5 text-slate-600 hover:bg-slate-200 rounded-xl font-bold transition-colors",children:"إلغاء"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:310,columnNumber:33},void 0),t.jsxDEV("button",{onClick:X,className:"px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-md shadow-indigo-500/20 hover:bg-indigo-700 transition-all",children:"تأكيد التجديد"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:311,columnNumber:33},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:309,columnNumber:29},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:286,columnNumber:25},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:243,columnNumber:17},void 0),t.jsxDEV("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-6",children:[t.jsxDEV("div",{className:"bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col",children:[t.jsxDEV("h3",{className:"font-black text-slate-800 mb-6 flex items-center gap-2",children:[t.jsxDEV("span",{className:"w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600",children:t.jsxDEV(G,{size:18},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:322,columnNumber:132},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:322,columnNumber:33},void 0),"تفاصيل العضوية"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:321,columnNumber:29},void 0),t.jsxDEV("div",{className:"flex-1 space-y-6",children:[t.jsxDEV("div",{className:"p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between",children:[t.jsxDEV("div",{children:[t.jsxDEV("div",{className:"text-sm font-bold text-slate-500 mb-1",children:"العميل"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:329,columnNumber:41},void 0),t.jsxDEV("div",{className:"text-lg font-black text-slate-800",children:o.customerName},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:330,columnNumber:41},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:328,columnNumber:37},void 0),t.jsxDEV("div",{className:"text-right",children:[t.jsxDEV("div",{className:"text-sm font-bold text-slate-500 mb-1",children:"الباقة"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:333,columnNumber:41},void 0),t.jsxDEV("div",{className:"text-lg font-black text-indigo-600",children:o.packageName},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:334,columnNumber:41},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:332,columnNumber:37},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:327,columnNumber:33},void 0),t.jsxDEV("div",{className:"grid grid-cols-2 gap-4",children:[t.jsxDEV("div",{className:"p-4 rounded-xl border border-slate-100",children:[t.jsxDEV("div",{className:"flex items-center gap-2 text-sm font-bold text-slate-500 mb-2",children:[t.jsxDEV(le,{size:16,className:"text-indigo-400"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:341,columnNumber:45},void 0)," البداية"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:340,columnNumber:41},void 0),t.jsxDEV("div",{className:"font-black text-slate-800",children:V(new Date(o.joinDate),"yyyy-MM-dd")},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:343,columnNumber:41},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:339,columnNumber:37},void 0),t.jsxDEV("div",{className:"p-4 rounded-xl border border-slate-100",children:[t.jsxDEV("div",{className:"flex items-center gap-2 text-sm font-bold text-slate-500 mb-2",children:[t.jsxDEV(D,{size:16,className:"text-rose-400"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:347,columnNumber:45},void 0)," الانتهاء"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:346,columnNumber:41},void 0),t.jsxDEV("div",{className:"font-black text-slate-800",children:o.endDate?V(new Date(o.endDate),"yyyy-MM-dd"):"غير محدد"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:349,columnNumber:41},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:345,columnNumber:37},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:338,columnNumber:33},void 0),t.jsxDEV("div",{className:"mt-8 pt-6 border-t border-slate-100",children:[t.jsxDEV("h4",{className:"text-sm font-bold text-slate-600 mb-6 text-center",children:"الرصيد المتبقي (الزيارات)"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:355,columnNumber:37},void 0),o.remainingVisits!==null?t.jsxDEV("div",{className:"flex justify-center items-center",children:t.jsxDEV("div",{className:"relative w-40 h-40",children:[t.jsxDEV("svg",{className:"w-full h-full",viewBox:"0 0 100 100",children:[t.jsxDEV("circle",{className:"text-slate-100 stroke-current",strokeWidth:"8",cx:"50",cy:"50",r:"40",fill:"transparent"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:361,columnNumber:53},void 0),t.jsxDEV("circle",{className:`${o.remainingVisits<5?"text-rose-500":"text-indigo-500"} stroke-current transition-all duration-1000 ease-in-out`,strokeWidth:"8",strokeLinecap:"round",cx:"50",cy:"50",r:"40",fill:"transparent",strokeDasharray:`${Math.min(100,Math.max(0,o.remainingVisits/(o.includedVisits||o.remainingVisits||1)*100))*2.51} 251.2`,transform:"rotate(-90 50 50)"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:363,columnNumber:53},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:359,columnNumber:49},void 0),t.jsxDEV("div",{className:"absolute inset-0 flex flex-col items-center justify-center",children:[t.jsxDEV("span",{className:"text-4xl font-black text-slate-800",children:o.remainingVisits},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:373,columnNumber:53},void 0),t.jsxDEV("span",{className:"text-xs font-bold text-slate-500 mt-1",children:"زيارة"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:374,columnNumber:53},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:372,columnNumber:49},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:358,columnNumber:45},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:357,columnNumber:41},void 0):t.jsxDEV("div",{className:"flex justify-center",children:t.jsxDEV("div",{className:"px-8 py-4 bg-emerald-50 text-emerald-700 rounded-full font-black flex items-center gap-2 border border-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.15)]",children:[t.jsxDEV(z,{size:20},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:381,columnNumber:49},void 0)," زيارات غير محدودة"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:380,columnNumber:45},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:379,columnNumber:41},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:354,columnNumber:33},void 0),o.description&&t.jsxDEV("div",{className:"p-4 bg-amber-50/50 border border-amber-100 rounded-xl mt-4",children:[t.jsxDEV("div",{className:"text-sm font-bold text-amber-800 mb-1 flex items-center gap-2",children:[t.jsxDEV(B,{size:16},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:390,columnNumber:45},void 0)," ملاحظات"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:389,columnNumber:41},void 0),t.jsxDEV("div",{className:"text-sm text-amber-900 leading-relaxed",children:o.description},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:392,columnNumber:41},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:388,columnNumber:37},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:326,columnNumber:29},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:320,columnNumber:25},void 0),t.jsxDEV("div",{className:"bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col",children:[t.jsxDEV("h3",{className:"font-black text-slate-800 mb-6 flex items-center gap-2",children:[t.jsxDEV("span",{className:"w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600",children:t.jsxDEV(ne,{size:18},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:401,columnNumber:132},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:401,columnNumber:33},void 0),"سجل الحركات (Timeline)"]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:400,columnNumber:29},void 0),t.jsxDEV("div",{className:"flex-1 overflow-auto pr-2 custom-scrollbar",children:o.logs&&o.logs.length>0?t.jsxDEV("div",{className:"relative border-r-2 border-slate-100 mr-4 space-y-6 pt-2 pb-4",children:o.logs.map((d,C)=>{let N=B,R="bg-slate-100 text-slate-500";return d.action.includes("تجميد")?(N=j,R="bg-purple-100 text-purple-600"):d.action.includes("تجديد")||d.action.includes("تفعيل")?(N=T,R="bg-emerald-100 text-emerald-600"):d.action.includes("إنشاء")&&(N=ae,R="bg-indigo-100 text-indigo-600"),t.jsxDEV("div",{className:"relative pr-8",children:[t.jsxDEV("div",{className:`absolute top-0 -right-3.5 w-7 h-7 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${R} z-10`,children:t.jsxDEV(N,{size:12,strokeWidth:3},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:420,columnNumber:57},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:419,columnNumber:53},void 0),t.jsxDEV("div",{className:"bg-white p-4 rounded-xl border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:border-indigo-100 hover:shadow-md transition-all group",children:[t.jsxDEV("div",{className:"flex justify-between items-start mb-2",children:[t.jsxDEV("span",{className:"font-bold text-slate-800 group-hover:text-indigo-700 transition-colors",children:d.action},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:426,columnNumber:61},void 0),t.jsxDEV("span",{className:"text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md",children:V(new Date(d.createdAt),"yyyy-MM-dd HH:mm")},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:427,columnNumber:61},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:425,columnNumber:57},void 0),t.jsxDEV("div",{className:"text-sm text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100/50",children:d.notes||"لا توجد ملاحظات إضافية"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:429,columnNumber:57},void 0),t.jsxDEV("div",{className:"text-xs font-bold text-slate-400 mt-3 flex items-center gap-1.5",children:[t.jsxDEV(G,{size:12},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:431,columnNumber:61},void 0),"بواسطة: ",d.createdBy]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:430,columnNumber:57},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:424,columnNumber:53},void 0)]},d.id,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:417,columnNumber:49},void 0)})},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:407,columnNumber:37},void 0):t.jsxDEV("div",{className:"flex flex-col items-center justify-center h-full py-12 text-center space-y-3",children:[t.jsxDEV("div",{className:"w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300",children:t.jsxDEV(B,{size:32},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:442,columnNumber:45},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:441,columnNumber:41},void 0),t.jsxDEV("div",{className:"text-slate-500 font-medium",children:"لا توجد حركات مسجلة"},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:444,columnNumber:41},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:440,columnNumber:37},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:405,columnNumber:29},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:399,columnNumber:25},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:318,columnNumber:21},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:240,columnNumber:17},void 0)},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:239,columnNumber:13},void 0),t.jsxDEV(K,{},void 0,!1,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:452,columnNumber:13},void 0)]},void 0,!0,{fileName:"F:/Codes/ERP/18 -12 B/Cloud ERP 12-16 H/Cloud ERP/pages/Memberships/MembershipDetail.tsx",lineNumber:145,columnNumber:9},void 0)};export{Le as MembershipDetail,Le as default};
