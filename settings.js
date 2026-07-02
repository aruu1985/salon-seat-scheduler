(function(){
  let notify=()=>{},openDanger=()=>{};
  const $=id=>document.getElementById(id);
  function openHome(){$('settingsHomeModal').classList.add('open')}
  function closeHome(){$('settingsHomeModal').classList.remove('open')}
  function init(options={}){
    notify=options.notify||notify;
    openDanger=options.openDanger||openDanger;
    $('settingsBtn').onclick=openHome;
    $('settingsHomeClose').onclick=closeHome;
    $('peopleSettingsBtn').onclick=()=>{closeHome();window.SalonStaff.open()};
    $('dangerSettingsBtn').onclick=()=>{closeHome();openDanger()};
    $('businessSettingsBtn').onclick=()=>notify('營業設定會在下一階段完成。');
    $('serviceSettingsBtn').onclick=()=>notify('消費項目的修改、停用與排序會在下一階段完成。');
    $('systemSettingsBtn').onclick=()=>notify('系統設定會在後續階段完成。');
    $('settingsHomeModal').onclick=event=>{if(event.target===$('settingsHomeModal'))closeHome()};
  }
  window.SalonSettings={init,openHome};
})();
