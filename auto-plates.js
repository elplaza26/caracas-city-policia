let personnelPlateOperation='';
async function suggestNextPlate(field,operation){
 field.dataset.plateOperation=operation;field.dataset.autoPlate='true';field.value='';field.placeholder='Consultando siguiente placa…';
 try{
  const result=await request('next-plate',{method:'GET'});
  if(field.dataset.plateOperation!==operation||field.dataset.autoPlate!=='true')return;
  if(!/^\d+$/.test(String(result.plate||'')))throw Error('No se recibió una placa válida.');
  field.value=result.plate;field.placeholder='Siguiente placa automática';
 }catch(error){if(field.dataset.plateOperation!==operation)return;field.placeholder='Escribe una placa o reabre para reintentar';showToast('No se pudo consultar la siguiente placa. '+error.message);}
}
for(const id of ['personPlate','admissionPlate'])$(id).addEventListener('input',event=>{event.target.dataset.autoPlate='false';});
