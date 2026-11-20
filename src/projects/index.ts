import type { ProjectEntry } from '../lib/types';
import { bammi } from './bammi';
import { moojong } from './moojong';
import { pasturePatrol } from './pasture-patrol';
import { pastureTactics } from './pasture-tactics';

export const projects: ProjectEntry[] = [pastureTactics, moojong, pasturePatrol, bammi];
