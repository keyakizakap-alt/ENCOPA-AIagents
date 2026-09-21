import { GroupRoom } from '@/components/encopa/group-room';
export const metadata={title:'会のグループ | ENCOPA',robots:{index:false,follow:false}};
export default async function GroupPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <GroupRoom id={id}/>}
