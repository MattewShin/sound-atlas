export function profileRoute(section='') {
  if (section==='posts') return {view:'records',filter:'public',canonical:'records/public'}
  const [view,filter]=section.split('/')
  if (view==='records') return {view,filter:['private','public'].includes(filter)?filter:'all'}
  if (['taste','settings','edit','preview','blocked','privacy'].includes(view)) return {view}
  return {view:'home'}
}
