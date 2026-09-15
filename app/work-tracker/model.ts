export const categories = ['Publications','News & press releases','Sampada','Annual reports','Representations','Distribution'] as const;
export type Category = typeof categories[number];
export const stages: Record<Category,string[]> = {
  Publications:['Needs confirmation','Concept','Content preparation','Review','Editing','Design','Final approval','Ready for release','Completed','On hold'],
  'News & press releases':['Needs confirmation','Proposed','Drafting','Review','Approved','Sent to publisher','Published','On hold'],
  Sampada:['Needs confirmation','Planning','Content preparation','Review','Design','Final approval','Ready for release','Completed','On hold'],
  'Annual reports':['Needs confirmation','Planning','Content preparation','Proofreading','Review','Design','Final approval','Ready for release','Completed','On hold'],
  Representations:['Needs confirmation','Drafting','Review','Approved','Sent','Acknowledged','Follow-up','Closed','On hold'],
  Distribution:['Needs confirmation','Planned','Ready to send','Sent','Received','On hold'],
};
export const deliveryStates=['Not planned','Pending','Done','Not required'] as const;
export type DocumentVersion={id:string;name:string;url:string;kind:"Working document"|"Final PDF"|"Supporting file";version:string;addedAt:string;addedBy:string};
export type WorkItem={reviewer?:string;priority?:string;publicationDate?:string;issueMonth?:string;theme?:string;acknowledgementDate?:string;followUpDate?:string;quantity?:string;deliveryMethod?:string;receiptDate?:string;resolutionNote?:string;documents?:DocumentVersion[];sourceConfirmed?:boolean;id:string;category:Category;title:string;stage:string;owner:string;dueDate:string;nextAction:string;notes:string;workingUrl:string;publishedUrl:string;recipient:string;sentDate:string;response:string;printStatus:string;websiteStatus:string;distributionStatus:string;flags:string[];source:{sheet:string;row:number;cells:Record<string,string>}|null;revision:number;updatedAt:string;history:{at:string;summary:string;actor?:string;comment?:string;fromStage?:string;toStage?:string}[]};
export const fields=['title','stage','owner','dueDate','nextAction','notes','workingUrl','publishedUrl','recipient','sentDate','response','printStatus','websiteStatus','distributionStatus','reviewer','priority','publicationDate','issueMonth','theme','acknowledgementDate','followUpDate','quantity','deliveryMethod','receiptDate','resolutionNote'] as const;
export function blankItem(category:Category):WorkItem{return {id:'',category,title:'',stage:stages[category][1],owner:'',dueDate:'',nextAction:'',notes:'',workingUrl:'',publishedUrl:'',recipient:'',sentDate:'',response:'',printStatus:'Not planned',websiteStatus:'Not planned',distributionStatus:'Not planned',flags:[],source:null,revision:0,updatedAt:'',history:[]};}
export function complete(item:WorkItem){return ['Completed','Published','Closed','Received'].includes(item.stage)}
export function indiaToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function overdue(item:WorkItem,today=indiaToday()){return Boolean(item.dueDate&&item.dueDate<today&&!complete(item)&&item.stage!=='On hold')}
export function validDate(value:string){return !value||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)}
export function validateItem(input:Record<string,unknown>,previous?:WorkItem):WorkItem {
  const category=previous?.category??input.category;
  if(!categories.includes(category as Category))throw Error('Choose a valid category.');
  const item={...(previous??blankItem(category as Category))};
  for(const key of fields){const value=input[key]??item[key]??(key==='priority'?'Normal':'');if(typeof value!=='string'||value.length>(['notes','response'].includes(key)?15000:1000))throw Error(`Invalid ${key}.`);item[key]=value.trim();}
  if(input.sourceConfirmed!==undefined){if(typeof input.sourceConfirmed!=='boolean')throw Error('Invalid source confirmation.');item.sourceConfirmed=input.sourceConfirmed;}
  for(const key of ['publicationDate','acknowledgementDate','followUpDate','receiptDate'] as const)if(!validDate(item[key]||''))throw Error('Enter valid calendar dates.');
  if(item.issueMonth&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(item.issueMonth))throw Error('Choose a valid issue month and year.');
  if(item.quantity&&!/^[1-9]\d{0,6}$/.test(item.quantity))throw Error('Quantity must be a positive whole number.');
  if(!['Normal','High','Urgent','Low'].includes(item.priority||'Normal'))throw Error('Choose a valid priority.');
  if(item.sourceConfirmed&&!previous?.sourceConfirmed&&item.source&&!item.resolutionNote)throw Error('Add a review note explaining how the original values were resolved.');
  if(!item.title)throw Error('Enter a title.');
  if(!stages[item.category].includes(item.stage))throw Error('Choose a stage for this category.');
  if(!validDate(item.dueDate)||!validDate(item.sentDate))throw Error('Enter dates in YYYY-MM-DD format.');
  for(const key of ['workingUrl','publishedUrl'] as const){if(item[key]){try{const u=new URL(item[key]);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();}catch{throw Error('Document links must start with https:// or http://.')}}}
  for(const key of ['printStatus','websiteStatus','distributionStatus'] as const)if(!deliveryStates.includes(item[key] as typeof deliveryStates[number]))throw Error('Choose a valid delivery status.');
  if(item.websiteStatus==='Done'&&!item.publishedUrl)throw Error('Add the published link before marking website upload done.');
  if(['Publications','Sampada','Annual reports'].includes(item.category)&&item.stage==='Completed'){
    const values=[item.printStatus,item.websiteStatus,item.distributionStatus];
    if(!values.every(v=>v==='Done'||v==='Not required')||!values.includes('Done'))throw Error('Complete the required release activities, and mark the others Not required.');
  }
  return item;
}

export function attentionReasons(item:WorkItem,today=indiaToday()){
 if(complete(item))return [];
 const reasons:string[]=[];
 if(overdue(item,today))reasons.push('Overdue');
 if(!item.dueDate)reasons.push('No deadline');
 const end=new Date(today+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+7);
 if(item.dueDate>=today&&item.dueDate<=end.toISOString().slice(0,10)&&item.stage!=='On hold')reasons.push('Due this week');
 if(['Review','Proofreading','Final approval'].includes(item.stage))reasons.push('Pending review');
 if(!item.owner)reasons.push('Unassigned');
 if(item.followUpDate&&item.followUpDate<=today)reasons.push('Follow-up due');
 if(item.flags.length&&!item.sourceConfirmed)reasons.push('Import review');
 return reasons;
}
export function actionsFor(item:WorkItem){
 const actions:string[]=[];
 if(['Concept','Proposed','Planning','Content preparation','Drafting','Editing','Proofreading','Needs confirmation'].includes(item.stage)&&item.category!=='Distribution')actions.push('Send for review');
 if(item.stage==='Review')actions.push('Request changes',stages[item.category].includes('Design')?'Approve for design':'Approve');
 if(item.stage==='Design')actions.push('Send for final approval');
 if(item.stage==='Final approval')actions.push('Request changes','Approve for release');
 if(['Ready for release','Completed'].includes(item.stage)&&item.printStatus!=='Done')actions.push('Mark printed');
 if(item.stage==='Approved')actions.push(item.category==='Representations'?'Mark sent':'Send to publisher');
 if(item.stage==='Sent to publisher')actions.push('Mark published');
 if(item.category==='Representations'&&item.stage==='Sent')actions.push('Acknowledge receipt');
 if(item.category==='Distribution'&&item.stage==='Planned')actions.push('Ready to send');
 if(item.category==='Distribution'&&item.stage==='Ready to send')actions.push('Mark sent');
 if(item.category==='Distribution'&&item.stage==='Sent')actions.push('Confirm delivery');
 return actions;
}
export function applyAction(item:WorkItem,action:string,comment:string){
 if(!actionsFor(item).includes(action))throw Error('This action is not available at the current stage.');
 if(action==='Request changes'&&!comment.trim())throw Error('Explain the changes required.');
 if(action.startsWith('Send for')&&!item.reviewer?.trim())throw Error('Assign a reviewer first.');
 const change:Partial<WorkItem>={};
 const targets:Record<string,string>={'Send for review':'Review','Approve for design':'Design','Approve':'Approved','Send for final approval':'Final approval','Approve for release':'Ready for release','Send to publisher':'Sent to publisher','Mark published':'Published','Mark sent':'Sent','Acknowledge receipt':'Acknowledged','Ready to send':'Ready to send','Confirm delivery':'Received'};
 if(targets[action])change.stage=targets[action];
 if(action==='Request changes')change.stage=stages[item.category].includes('Editing')?'Editing':stages[item.category].includes('Drafting')?'Drafting':'Content preparation';
 if(action==='Mark printed')change.printStatus='Done';
 if(action==='Mark published'){if(!item.publishedUrl)throw Error('Add the published link first.');change.websiteStatus='Done';}
 if(['Mark sent','Send to publisher'].includes(action))change.sentDate=indiaToday();
 if(action==='Acknowledge receipt')change.acknowledgementDate=indiaToday();
 if(action==='Confirm delivery'){if(!item.recipient||!item.quantity||!item.deliveryMethod)throw Error('Add recipient, quantity and delivery method first.');change.receiptDate=indiaToday();change.distributionStatus='Done';}
 return {...item,...change};
}
