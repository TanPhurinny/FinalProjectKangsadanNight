'use strict';

const ZONE_STALLS = {
  A: {
    type: 'vertical-columns',
    columns: [
      { label: 'A101–A117' }, { label: 'A201–A217' }, { label: 'A301–A334' },
      { label: 'A401–A434' }, { label: 'A501–A536' }, { label: 'A601–A636' },
    ]
  },
  B: {
    type: 'vertical-columns',
    columns: [
      { label: 'B101–B117' }, { label: 'B201–B217' }, { label: 'B301–B334' },
      { label: 'B401–B434' }, { label: 'B501–B536' }, { label: 'B601–B636' },
    ]
  },
  C: {
    type: 'horizontal-row',
    stalls: (() => { const r=[]; for(let i=101;i<=112;i++) r.push('C'+i); return r; })()
  },
  D: {
    type: 'horizontal-row',
    stalls: (() => { const r=[]; for(let i=101;i<=108;i++) r.push('D'+i); return r; })()
  },
  E: {
    type: 'horizontal-row',
    stalls: ['E101','E102','E103','E104']
  },
  F: {
    type: 'vertical-columns',
    columns: [
      { label: 'F101–F117' }, { label: 'F201–F217' }, { label: 'F301–F334' },
      { label: 'F401–F434' }, { label: 'F501–F536' }, { label: 'F601–F636' },
    ]
  }
};

const ALL_ZONES = ['A','B','C','D','E','F'];

function renderVerticalColumns(containerId, columns) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  Object.assign(container.style, {
    display: 'flex', flexDirection: 'row', gap: '4px',
    width: '100%', height: '100%', padding: '6px',
    alignItems: 'stretch', overflow: 'hidden'
  });

  columns.forEach(col => {
    const colEl = document.createElement('div');
    Object.assign(colEl.style, {
      display: 'flex', flexDirection: 'column', flex: '1',
      height: '100%', background: '#dbeeff', border: '2.5px solid #1a6fcf',
      borderRadius: '3px', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', padding: '4px 2px', transition: 'background 0.15s'
    });

    const labelEl = document.createElement('span');
    labelEl.textContent = col.label;
    Object.assign(labelEl.style, {
      writingMode: 'vertical-rl', transform: 'rotate(180deg)',
      fontSize: '11px', fontWeight: '700', color: '#0d4a99',
      whiteSpace: 'nowrap', letterSpacing: '0.02em',
      fontFamily: "'Sarabun', sans-serif", userSelect: 'none'
    });

    colEl.appendChild(labelEl);

    colEl.addEventListener('mouseenter', () => {
      if (!colEl.dataset.selected) colEl.style.background = '#b3d9ff';
    });
    colEl.addEventListener('mouseleave', () => {
      if (!colEl.dataset.selected) colEl.style.background = '#dbeeff';
    });
    colEl.addEventListener('click', () => {

  container.querySelectorAll('div').forEach(c => {
    delete c.dataset.selected;
    c.style.background = '#dbeeff';
    c.querySelector && c.querySelector('span') && (c.querySelector('span').style.color = '#3bb8d4');
  });

  colEl.dataset.selected = '1';
  colEl.style.background = '#3bb8d4';
  labelEl.style.color = '#fff';

  /* เปิด popup หลังจากคลิก */
  showPopup(col.label);

});
    container.appendChild(colEl);
   
  });
}

function renderHorizontalRow(containerId, stalls) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  Object.assign(container.style, {
    display: 'flex', flexDirection: 'row', flexWrap: 'nowrap',
    gap: '3px', width: '100%', height: '100%', padding: '4px',
    alignItems: 'stretch', overflow: 'hidden'
  });

  stalls.forEach(name => {
    const el = document.createElement('div');
    el.textContent = name;
    Object.assign(el.style, {
      flex: '1', minWidth: '0', background: '#dbeeff',
      border: '2px solid #1a6fcf', borderRadius: '3px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '10px', fontWeight: '700', color: '#0d4a99',
      cursor: 'pointer', transition: 'background 0.15s',
      fontFamily: "'Sarabun', sans-serif", whiteSpace: 'nowrap', userSelect: 'none'
    });

    el.addEventListener('mouseenter', () => {
      if (!el.dataset.selected) el.style.background = '#b3d9ff';
    });
    el.addEventListener('mouseleave', () => {
      if (!el.dataset.selected) el.style.background = '#dbeeff';
    });
    el.addEventListener('click', () => {
      container.querySelectorAll('div').forEach(c => {
        delete c.dataset.selected;
        c.style.background = '#dbeeff';
        c.style.color = '#0d4a99';
      });
      el.dataset.selected = '1';
      el.style.background = '#1a6fcf';
      el.style.color = '#fff';
    });

    container.appendChild(el);
  });
}

function activateZone(zone) {

const blockEl = document.getElementById(`zone-${zone}-block`);
if (!blockEl) return;

blockEl.classList.add('is-active');

const lbl = blockEl.querySelector('.zone-label');
if (lbl) lbl.style.display = 'none';

const container = document.getElementById(`stalls-${zone}`);
if (!container) return;

container.innerHTML = '';

/* ===== โซนเล็กให้เป็นก้อนเดียว ===== */

if(zone === 'E'){
createSingleBlock(container,'E101-E104');
return;
}

if(zone === 'D'){
createSingleBlock(container,'D201-D212');
return;
}

if(zone === 'C'){
createSingleBlock(container,'C101-C112');
return;
}

if(zone === 'B'){

container.innerHTML="";

/* ===== ส่วนแท่งยาว ===== */

const longColumns=[
'B100-B123',
'B200-B223',
'B299-B323',
'B401-B423',
'B501-B523',
'B601-B623'
];

container.style.display="flex";
container.style.flexDirection="row";
container.style.gap="10px";
container.style.alignItems="stretch";

/* กล่องแท่งยาว */

longColumns.forEach(text=>{

const col=document.createElement("div");

Object.assign(col.style,{
flex:"1",
background:"#dbeeff",
border:"3px solid #1a6fcf",
borderRadius:"6px",
display:"flex",
alignItems:"center",
justifyContent:"center"
});

const label=document.createElement("span");

label.textContent=text;

Object.assign(label.style,{
writingMode:"vertical-rl",
transform:"rotate(180deg)",
fontWeight:"700",
color:"#0d4a99",
fontFamily:"'Sarabun', sans-serif"
});

col.appendChild(label);
container.appendChild(col);

});


/* ===== ส่วนแท่งสั้นด้านขวา ===== */

const smallBoxContainer=document.createElement("div");

Object.assign(smallBoxContainer.style,{
display:"flex",
flexDirection:"column",
gap:"10px",
marginLeft:"10px"
});

const smallBoxes=[
'B801-B804'
];

smallBoxes.forEach(text=>{

const box=document.createElement("div");

box.textContent=text;

Object.assign(box.style,{
background:"#dbeeff",
border:"3px solid #1a6fcf",
borderRadius:"6px",
padding:"10px",
fontWeight:"700",
color:"#0d4a99",
fontFamily:"'Sarabun', sans-serif",
writingMode:"vertical-rl",
transform:"rotate(180deg)",
display:"flex",
alignItems:"center",
justifyContent:"center"
});

smallBoxContainer.appendChild(box);

});

container.appendChild(smallBoxContainer);

return;
}

/* ===== โซนใหญ่ใช้ระบบเดิม ===== */

const config = ZONE_STALLS[zone];

if (!config) return;

if (config.type === 'vertical-columns') {
renderVerticalColumns(`stalls-${zone}`, config.columns);
}

}

function resetZone(zone) {
  const blockEl = document.getElementById(`zone-${zone}-block`);
  if (!blockEl) return;
  blockEl.classList.remove('is-active');
  const lbl = blockEl.querySelector('.zone-label');
  if (lbl) lbl.style.display = '';
  const sc = document.getElementById(`stalls-${zone}`);
  if (sc) { sc.innerHTML = ''; sc.removeAttribute('style'); }
}

document.addEventListener('DOMContentLoaded', () => {
  const dropdown = document.getElementById('zoneDropdown');
  if (!dropdown) return;
  dropdown.addEventListener('change', () => {
    const selected = dropdown.value;
    ALL_ZONES.forEach(z => resetZone(z));
    if (selected && ALL_ZONES.includes(selected)) activateZone(selected);
  });
  
});
function createSingleBlock(container,text){

const box=document.createElement("div");

box.textContent=text;

Object.assign(box.style,{
background:"#dbeeff",
border:"3px solid #1a6fcf",
borderRadius:"6px",
padding:"8px 18px",
fontWeight:"700",
color:"#0d4a99",
fontFamily:"'Sarabun', sans-serif",
cursor:"pointer"
});

container.style.display="flex";
container.style.alignItems="center";
container.style.justifyContent="center";

container.appendChild(box);

}
function showPopup(title){

const popup=document.getElementById("stallPopup");
const popupTitle=document.getElementById("popupTitle");

popupTitle.innerText="แถว "+title;

popup.style.display="flex";

}

document.addEventListener("click",function(e){

if(e.target.id==="closePopup"){
document.getElementById("stallPopup").style.display="none";
}

});