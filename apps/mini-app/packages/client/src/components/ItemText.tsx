import { cloneElement, isValidElement, type ComponentChildren, type VNode } from 'preact';
import { itemMentions } from '../item-mentions';
import './item-text.css';

/** Сохраняет исходные слова и разметку. Названия вещей получают компактную иконку. */
export function ItemText({children}:{children?:ComponentChildren}) {
  const enrich=(child:ComponentChildren):ComponentChildren=>{
    if(typeof child==='string')return itemMentions(child).map((part,i)=>part.src
      ? <strong class="item-mention" key={i}><img src={part.src} alt="" aria-hidden="true" width="22" height="22" loading="lazy" decoding="async"/>{part.text}</strong>
      : part.text);
    if(Array.isArray(child))return child.map(enrich);
    if(isValidElement(child)&&typeof child.type==='string'&&['span','b','strong','em','i','small','a'].includes(child.type)){
      const node=child as VNode<{children?:ComponentChildren;class?:string}>;
      if(node.props.class?.includes('item-mention')||node.props.class?.includes('hidden-item'))return child;
      return cloneElement(node,{children:enrich(node.props.children)});
    }
    return child;
  };
  return <>{enrich(children)}</>;
}
