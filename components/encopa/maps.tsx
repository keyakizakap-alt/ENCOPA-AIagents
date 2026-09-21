export function MapLinks({address}:{address:string}){
  if(!address.trim())return <p className="text-sm text-muted-ink">住所を入力すると地図と経路を確認できます。</p>;
  const q=encodeURIComponent(address.trim());
  return <div className="flex flex-wrap gap-2">
    <a className="enc-secondary" href={`https://www.google.com/maps/search/?api=1&query=${q}`} target="_blank" rel="noopener noreferrer">Googleマップで開く ↗</a>
    <a className="enc-secondary" href={`https://maps.apple.com/?q=${q}`} target="_blank" rel="noopener noreferrer">Appleマップで開く ↗</a>
  </div>
}

export function VenueMap({address,label}:{address:string;label:string}){
  const location=address.trim();
  if(!location)return <div className="grid min-h-48 place-items-center rounded-2xl bg-[#eef0eb] px-6 text-center text-sm leading-6 text-muted-ink">住所を入力すると、ここに周辺地図が表示されます。</div>;
  return <iframe
    title={`${label}の周辺地図`}
    src={`https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`}
    className="min-h-56 w-full rounded-2xl border-0"
    loading="lazy"
    referrerPolicy="no-referrer-when-downgrade"
    allowFullScreen
  />
}
