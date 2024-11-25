import { AppComponent } from '../types';

/**
 * ArtifactConverter
 */
export abstract class ArtifactConverter {
    constructor(protected readonly app: AppComponent) {}
}
