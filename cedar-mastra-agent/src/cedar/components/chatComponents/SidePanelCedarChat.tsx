import React from 'react';
import { X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useCedarStore } from 'cedar-os';
import { SidePanelContainer } from '@/cedar/components/structural/SidePanelContainer';
import { CollapsedButton } from '@/cedar/components/chatMessages/structural/CollapsedChatButton';
import Container3D from '@/cedar/components/containers/Container3D';
import { SocVercelChat } from '@/cedar/components/vercelChat/SocVercelChat';

interface SidePanelCedarChatProps {
	children?: React.ReactNode;
	side?: 'left' | 'right';
	title?: string;
	collapsedLabel?: string;
	showCollapsedButton?: boolean;
	companyLogo?: React.ReactNode;
	dimensions?: {
		width?: number;
		minWidth?: number;
		maxWidth?: number;
	};
	resizable?: boolean;
	className?: string;
	topOffset?: number;
	stream?: boolean;
}

export const SidePanelCedarChat: React.FC<SidePanelCedarChatProps> = ({
	children,
	side = 'right',
	title = 'Cedar Chat',
	collapsedLabel = 'How can I help you today?',
	showCollapsedButton = true,
	companyLogo,
	dimensions = {
		width: 600,
		minWidth: 300,
		maxWidth: 800,
	},
	resizable = true,
	className = '',
	topOffset = 0,
}) => {
	const showChat = useCedarStore((state) => state.showChat);
	const setShowChat = useCedarStore((state) => state.setShowChat);

	return (
		<>
			{showCollapsedButton && (
				<AnimatePresence mode='wait'>
					{!showChat && (
						<CollapsedButton
							side={side}
							label={collapsedLabel}
							onClick={() => setShowChat(true)}
							layoutId='cedar-sidepanel-chat'
							position='fixed'
						/>
					)}
				</AnimatePresence>
			)}

			<SidePanelContainer
				isActive={showChat}
				side={side}
				dimensions={dimensions}
				resizable={resizable}
				topOffset={topOffset}
				panelClassName={`bg-surface-0 ${className}`}
				panelContent={
					<Container3D className='flex h-full flex-col'>
						<div className='z-20 flex min-w-0 flex-shrink-0 flex-row items-center justify-between border-b border-border-subtle px-4 py-2.5'>
							<div className='flex min-w-0 flex-1 items-center'>
								{companyLogo && (
									<div className='mr-2 h-5 w-5 flex-shrink-0'>{companyLogo}</div>
								)}
								<span className='truncate text-sm font-medium text-foreground'>
									{title}
								</span>
							</div>
							<div className='flex flex-shrink-0 items-center gap-2'>
								<button
									className='rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground'
									onClick={() => setShowChat(false)}
									aria-label='Close chat'>
									<X className='h-4 w-4' strokeWidth={2.5} />
								</button>
							</div>
						</div>

						<SocVercelChat />
					</Container3D>
				}>
				{children}
			</SidePanelContainer>
		</>
	);
};
