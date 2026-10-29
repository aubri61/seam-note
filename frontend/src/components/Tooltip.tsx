import type { ReactElement } from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'
import styled from '@emotion/styled'
const Content = styled(RadixTooltip.Content)(({theme})=>({
  zIndex:100,padding:'7px 10px',maxWidth:320,borderRadius:theme.radii.sm,
  background:theme.colors.text,color:theme.colors.surface,fontSize:12,lineHeight:1.5,
  boxShadow:theme.shadow,animation:'none',pointerEvents:'none',
}))
export function Tooltip({label,children}:{label?:string;children:ReactElement}) {
  if(!label)return children
  return <RadixTooltip.Provider delayDuration={300} disableHoverableContent><RadixTooltip.Root><RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
    <RadixTooltip.Portal><Content sideOffset={8} collisionPadding={12}>{label}</Content></RadixTooltip.Portal>
  </RadixTooltip.Root></RadixTooltip.Provider>
}
