<script lang="ts">
	import { Editor } from '../src';
</script>

<div class="container">
	<Editor
		value={localStorage.getItem('doc')}
		onvaluechange={(val) => localStorage.setItem('doc', val)}
	/>
</div>

<style>
	.container {
		margin: 60px auto;
		min-height: 600px;
		width: 650px;
		background-color: #fff;
		border: 1px solid #ccc;
		border-radius: 20px;
	}
</style>
