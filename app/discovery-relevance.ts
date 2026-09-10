export function relevantHeadline(title:string){
 const value=' '+title.normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g,' ').trim()+' ';
 return ['mccia','mahratta chamber','maratha chamber','prashant girbane','प्रशांत गिरबने','प्रशांत गिरबाणे','प्रशांत गिरबणे','एमसीसीआयए','एमसीसीआईए','मराठा चेंबर'].some(marker=>value.includes(' '+marker+' '));
}
