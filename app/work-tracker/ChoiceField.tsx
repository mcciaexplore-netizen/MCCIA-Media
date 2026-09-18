import {useId} from 'react';
export default function ChoiceField({label,value,options,onChange}:{label:string;value:string;options:readonly string[];onChange:(value:string)=>void}){
 const name=useId();
 return <fieldset className="wt-choice"><legend>{label}</legend><div>{options.map(option=><label key={option}><input type="radio" name={name} value={option} checked={value===option} onChange={()=>onChange(option)}/><span>{option}</span></label>)}</div></fieldset>;
}
